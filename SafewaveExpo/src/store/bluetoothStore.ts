import { create } from 'zustand';
import { AppState } from 'react-native';
import { State } from 'react-native-ble-plx';
import { BLEManager } from '../services/bluetooth/BLEManager';
import {
  isValidDeviceName,
  BATTERY_SERVICE_UUID,
  DEVICE_INFO_SERVICE_UUID,
  MAIN_SERVICE_UUID,
  OTA_SERVICE_UUID,
  HID_SERVICE_UUID,
} from '../services/bluetooth/BLEConstants';
import { NotificationService } from '../services/NotificationService';
import { ActivityLogService } from '../services/ActivityLogService';
import { ForegroundServiceManager } from '../services/ForegroundServiceManager';
import { FirestoreService } from '../services/firebase/FirestoreService';
import { useAuthStore } from './authStore';
import {
  BLEDevice,
  BluetoothState,
  BluetoothActions,
  BluetoothStore,
  VibrationCommand,
  DEFAULT_VIBRATION,
} from '../types/bluetooth';
import { BandDocument } from '../types/user';

// Low battery threshold for alerts
const LOW_BATTERY_THRESHOLD = 20;
const HEARTBEAT_INTERVAL_MS = 60000;
const RECONNECT_SCAN_DURATION_MS = 5000;
const RECONNECT_INITIAL_WAIT_MS = 5000;
const RECONNECT_STEADY_WAIT_MS = 25000;
const RECONNECT_INITIAL_CYCLES = 6;
const RECONNECT_CONNECT_DELAY_MS = 1000;

const CONNECT_TIMEOUT_MS = 30000; // 30s overall timeout for the entire connect flow

const SAFEWAVE_SERVICE_UUIDS = [
  BATTERY_SERVICE_UUID,
  DEVICE_INFO_SERVICE_UUID,
  MAIN_SERVICE_UUID,
  OTA_SERVICE_UUID,
  HID_SERVICE_UUID,
].map((uuid) => uuid.toLowerCase());

const matchesDeviceForUser = (
  device: BLEDevice,
  isAdmin: boolean,
  hasOrganization: boolean,
  assignedBandNames: string[]
): boolean => {
  const serviceUUIDs = (device.serviceUUIDs || []).map((uuid) => uuid.toLowerCase());
  const hasSafewaveServices = SAFEWAVE_SERVICE_UUIDS.some((uuid) =>
    serviceUUIDs.includes(uuid)
  );
  const deviceName = device.name || device.localName || '';
  const normalizedName = deviceName.toLowerCase();

  if (isAdmin) {
    const hasSafewaveName = isValidDeviceName(deviceName);
    return hasSafewaveServices || hasSafewaveName;
  }

  if (hasOrganization) {
    const isAssigned = assignedBandNames.some((bandName) => normalizedName === bandName);
    return isAssigned && hasSafewaveServices;
  }

  return hasSafewaveServices;
};

// Track if low battery was already reported for current connection
let lowBatteryReported = false;
let heartbeatIntervalId: NodeJS.Timeout | null = null;
let reconnectIntervalId: NodeJS.Timeout | null = null;
let reconnectScanTimeoutId: NodeJS.Timeout | null = null;
let reconnectCycleCount = 0;
let manualDisconnectInProgress = false;
let reconnectInFlight = false;
let disconnectSubscription: (() => void) | null = null;
// Guard: prevent disconnect handler from firing more than once per connection
let disconnectHandled = false;
// Throttle 'startAutoReconnect skipped' log
let lastReconnectSkipLogTime = 0;

/**
 * Initial Bluetooth state
 */
const initialState: BluetoothState = {
  connectionState: 'idle',
  connectedDevice: null,
  reconnectingDeviceName: null,
  discoveredDevices: [],
  isScanning: false,
  assignedBands: [],
  batteryLevel: null,
  isCharging: false,
  firmwareVersion: null,
  error: null,
  hasPermissions: false,
  bluetoothEnabled: false,
};

/**
 * Zustand store for Bluetooth state management
 */
export const useBluetoothStore = create<BluetoothStore>((set, get) => ({
  ...initialState,

  stopAutoReconnect: () => {
    if (reconnectIntervalId) {
      clearInterval(reconnectIntervalId);
      reconnectIntervalId = null;
    }
    if (reconnectScanTimeoutId) {
      clearTimeout(reconnectScanTimeoutId);
      reconnectScanTimeoutId = null;
    }
    BLEManager.stopScan();
    set((state) => ({
      isScanning: false,
      reconnectingDeviceName: null,
      connectionState: state.connectionState === 'reconnecting' ? 'idle' : state.connectionState,
    }));
    reconnectCycleCount = 0;
    reconnectInFlight = false;
  },

  startAutoReconnect: (deviceId?: string, deviceName?: string) => {
    const { connectionState } = get();

    if (reconnectIntervalId || reconnectInFlight || connectionState === 'connecting' || connectionState === 'connected' || connectionState === 'reconnecting') {
      // Throttle this log to once every 10 seconds
      const now = Date.now();
      if (now - lastReconnectSkipLogTime > 10000) {
        console.log('[BLE Store] startAutoReconnect skipped (state:', connectionState + ')');
        lastReconnectSkipLogTime = now;
      }
      return;
    }

    console.log('[BLE Store] startAutoReconnect starting for:', deviceName || deviceId);
    reconnectCycleCount = 0;
    const scheduleNextAttempt = (): void => {
      const waitMs =
        reconnectCycleCount < RECONNECT_INITIAL_CYCLES
          ? RECONNECT_INITIAL_WAIT_MS
          : RECONNECT_STEADY_WAIT_MS;

      if (reconnectIntervalId) {
        clearTimeout(reconnectIntervalId);
      }

      reconnectIntervalId = setTimeout(attemptReconnect, waitMs);
    };
    const attemptReconnect = async () => {
      const { bluetoothEnabled, hasPermissions, isScanning, connectionState } = get();

      if (reconnectIntervalId) {
        clearTimeout(reconnectIntervalId);
        reconnectIntervalId = null;
      }

      if (connectionState === 'connecting' || connectionState === 'connected') {
        return;
      }

      if (!bluetoothEnabled || !hasPermissions) {
        scheduleNextAttempt();
        return;
      }

      // Background reconnect is now allowed — the Android foreground service
      // keeps the process alive, and iOS bluetooth-central background mode
      // permits BLE operations while backgrounded.

      if (reconnectInFlight) {
        return;
      }

      set({ connectionState: 'reconnecting' });

      try {
        reconnectInFlight = true;
        if (reconnectScanTimeoutId) {
          clearTimeout(reconnectScanTimeoutId);
          reconnectScanTimeoutId = null;
        }
        const lastDevice = await BLEManager.getLastDevice();
        const targetId = deviceId || lastDevice?.id;
        const targetName = (deviceName || lastDevice?.name || '').toLowerCase();
        const targetDisplayName = deviceName || lastDevice?.name || null;

        set({ reconnectingDeviceName: targetDisplayName });

        const { userDocument } = useAuthStore.getState();
        const isAdmin = userDocument?.role === 'org_admin' || userDocument?.role === 'super_admin';
        const hasOrganization = !!userDocument?.organizationId;

        if (!targetId && !targetName && !isAdmin && !hasOrganization) {
          console.log('[BLE Store] No target device and no way to filter — stopping reconnect');
          get().stopAutoReconnect();
          return;
        }
        let assignedBandNames: string[] = [];

        if (!isAdmin && hasOrganization) {
          await get().fetchAssignedBands();
          assignedBandNames = get().assignedBands.map((b) => b.name.toLowerCase());
        }

        let found = false;
        const handleDeviceFound = (device: BLEDevice) => {
          if (found) return;

          const foundName = (device.name || device.localName || '').toLowerCase();
          const matchesTargetId = !!targetId && device.id === targetId;
          const matchesTargetName = !!targetName && foundName === targetName;

          if (!matchesTargetId && !matchesTargetName) {
            if (!matchesDeviceForUser(device, isAdmin, hasOrganization, assignedBandNames)) {
              return;
            }
          }

          if (targetName && foundName !== targetName) {
            return;
          }

          if (targetId && device.id !== targetId) {
            return;
          }

          found = true;
          reconnectCycleCount += 1;
          console.log('[BLE Store] Reconnect: device matched!', device.name, device.id);
          set({ isScanning: false });
          if (reconnectScanTimeoutId) {
            clearTimeout(reconnectScanTimeoutId);
            reconnectScanTimeoutId = null;
          }
          BLEManager.stopScan();
          // Connect immediately -- setTimeout delays are unreliable in background
          console.log('[BLE Store] Reconnect: calling connect()...');
          get().connect(device.id)
            .then(() => {
              console.log('[BLE Store] Reconnect: connect succeeded!');
              get().stopAutoReconnect();
            })
            .catch((err: any) => {
              console.log('[BLE Store] Reconnect: connect FAILED:', err?.message || err);
              // Clear the error so the user doesn't see timeout messages during auto-reconnect
              set({ error: null, connectionState: 'reconnecting' });
              reconnectInFlight = false;
              scheduleNextAttempt();
            });
        };

        if (isScanning) {
          console.log('[BLE Store] Reconnect: scan already active, deferring');
          reconnectInFlight = false;
          scheduleNextAttempt();
          return;
        }

        console.log('[BLE Store] Reconnect: starting scan for', targetDisplayName || targetId);
        set({ isScanning: true });
        BLEManager.startScan(
          handleDeviceFound,
          // onError
          (errorMsg: string) => {
            console.log('[BLE Store] Reconnect scan error:', errorMsg);
          },
          // onComplete (scan timeout from BLEManager)
          () => {
            console.log('[BLE Store] Reconnect: BLEManager scan completed (timeout)');
            set({ isScanning: false });
            reconnectInFlight = false;
            reconnectCycleCount += 1;
            scheduleNextAttempt();
          }
        );

        // Our own shorter timeout for the reconnect scan
        reconnectScanTimeoutId = setTimeout(() => {
          console.log('[BLE Store] Reconnect: scan timeout (' + RECONNECT_SCAN_DURATION_MS + 'ms), scheduling next attempt');
          BLEManager.stopScan();
          set({ isScanning: false });
          reconnectInFlight = false;
          reconnectCycleCount += 1;
          scheduleNextAttempt();
        }, RECONNECT_SCAN_DURATION_MS);
      } catch (error) {
        // keep trying
        reconnectInFlight = false;
        scheduleNextAttempt();
      }
    };

    attemptReconnect();
  },

  /**
   * Initialize BLE manager and check permissions, then auto-connect
   */
  initialize: async () => {
    try {
      // Register iOS state restoration callback before initializing the manager.
      // When iOS relaunches the app to restore a BLE session, this fires with
      // the previously connected device ID so we can reconnect.
      BLEManager.onDeviceRestored((deviceId: string) => {
        console.log('[BLE Store] iOS restored device:', deviceId);
        const { connectionState } = get();
        if (connectionState === 'idle' || connectionState === 'reconnecting') {
          get().connect(deviceId).catch((err) => {
            console.log('[BLE Store] Failed to reconnect restored device:', err);
          });
        }
      });

      const { hasPermissions, bluetoothEnabled } = await BLEManager.initialize();
      set({ hasPermissions, bluetoothEnabled });

      // Subscribe to Bluetooth state changes
      BLEManager.onStateChange((state) => {
        const isEnabled = state === State.PoweredOn;
        set({ bluetoothEnabled: isEnabled });

        // Try to auto-connect when Bluetooth is turned on
        if (isEnabled && get().connectionState === 'idle' && !get().connectedDevice) {
          get().autoConnect();
        }
      });

      // Attempt auto-connect if Bluetooth is ready
      if (bluetoothEnabled && hasPermissions) {
        await get().autoConnect();
      }
    } catch (error: any) {
      set({ error: error.message || 'Failed to initialize Bluetooth' });
    }
  },

  /**
   * Auto-connect to a Safewave Band
   * First checks for already connected devices, then tries last known device
   */
  autoConnect: async () => {
    const { connectionState, hasPermissions, bluetoothEnabled } = get();

    // Don't auto-connect if already connecting/connected or no permissions
    if (connectionState !== 'idle' || !hasPermissions || !bluetoothEnabled) {
      return;
    }

    console.log('[BLE Store] Attempting auto-connect...');
    set({ connectionState: 'reconnecting' });

    try {
      // First, check for already connected Safewave devices
      const connectedDevices = await BLEManager.getConnectedDevices();
      console.log('[BLE Store] Found', connectedDevices.length, 'connected devices');

      if (connectedDevices.length > 0) {
        // Connect to the first Safewave device found
        const device = connectedDevices[0];
        console.log('[BLE Store] Auto-connecting to:', device.name, device.id);

        await get().connect(device.id);
        console.log('[BLE Store] Auto-connect successful');
        return;
      }

      // If no connected devices, try the last known device
      const lastDevice = await BLEManager.getLastDevice();
      if (lastDevice) {
        console.log('[BLE Store] Trying last known device:', lastDevice.name, lastDevice.id);
        try {
          await get().connect(lastDevice.id);
          console.log('[BLE Store] Reconnected to last device');
          return;
        } catch (error) {
          console.log('[BLE Store] Could not reconnect to last device, starting auto-reconnect');
          // Clear the user-visible error — this is an automatic retry, not a user action
          set({ error: null, connectionState: 'idle' });
          get().startAutoReconnect(lastDevice.id, lastDevice.name || undefined);
          return;
        }
      }

      // No cached device — scan to find a nearby band
      console.log('[BLE Store] No cached device, starting scan-based auto-reconnect');
      set({ connectionState: 'idle' });
      get().startAutoReconnect();
    } catch (error: any) {
      console.error('[BLE Store] Auto-connect error:', error);
      set({ connectionState: 'idle' });
      get().startAutoReconnect();
    }
  },

  /**
   * Fetch bands assigned to the current user
   * Used for filtering scanned devices
   */
  fetchAssignedBands: async () => {
    const { user } = useAuthStore.getState();

    if (!user) {
      console.log('[BLE Store] No user logged in, cannot fetch assigned bands');
      set({ assignedBands: [] });
      return;
    }

    try {
      console.log('[BLE Store] Fetching bands for user:', user.uid);
      const bands = await FirestoreService.getUserAssignedBands(user.uid);
      const assignedBands = bands.map((band) => ({
        id: band.id || '',
        name: band.name,
        organizationId: band.organizationId,
      }));

      console.log('[BLE Store] Fetched assigned bands:', assignedBands.length, assignedBands);
      set({ assignedBands });
    } catch (error) {
      console.error('[BLE Store] Error fetching assigned bands:', error);
      set({ assignedBands: [] });
    }
  },

  /**
   * Start scanning for BLE devices (filtered by assigned bands)
   * Only shows devices that match bands assigned to the current user
   */
  startScan: async () => {
    const { bluetoothEnabled, hasPermissions, isScanning } = get();
    const { userDocument } = useAuthStore.getState();
    const isAdmin = userDocument?.role === 'org_admin' || userDocument?.role === 'super_admin';
    const hasOrganization = !!userDocument?.organizationId;

    if (isScanning) {
      return;
    }

    if (!bluetoothEnabled) {
      set({ error: 'Bluetooth is not enabled. Please enable Bluetooth.' });
      return;
    }

    if (!hasPermissions) {
      set({ error: 'Bluetooth permissions not granted.' });
      return;
    }

    let assignedBandNames: string[] = [];

    if (!isAdmin && hasOrganization) {
      await get().fetchAssignedBands();
      assignedBandNames = get().assignedBands.map((b) => b.name.toLowerCase());
      console.log('[BLE Store] Scanning as org user (name + service filter):', assignedBandNames);
    } else if (isAdmin) {
      console.log('[BLE Store] Scanning as admin (service UUID filter)');
    } else {
      console.log('[BLE Store] Scanning as user without org (service UUID filter)');
    }

    set({
      isScanning: true,
      connectionState: 'scanning',
      discoveredDevices: [],
      error: null,
    });

    BLEManager.startScan(
      // On device found
      (device: BLEDevice, source?: 'connected' | 'scan') => {
        const { discoveredDevices, connectionState, connectedDevice } = get();

        if (source === 'connected') {
          const normalizedName = (device.name || device.localName || '').toLowerCase();
          const shouldAutoConnect = isAdmin
            ? true
            : hasOrganization
              ? assignedBandNames.includes(normalizedName)
              : true;

          if (
            shouldAutoConnect &&
            connectionState !== 'connecting' &&
            connectionState !== 'connected' &&
            connectedDevice?.id !== device.id
          ) {
            BLEManager.stopScan();
            set({ isScanning: false });
            get().connect(device.id).catch(() => undefined);
            return;
          }
        }

        if (
          !matchesDeviceForUser(device, isAdmin, hasOrganization, assignedBandNames)
        ) {
          return;
        }

        // Avoid duplicates
        if (!discoveredDevices.find((d) => d.id === device.id)) {
          console.log('[BLE Store] Found assigned device:', device.name);
          set({ discoveredDevices: [...discoveredDevices, device] });
        }
      },
      // On error
      (errorMessage: string) => {
        const { connectionState: currentState } = get();
        set({
          error: errorMessage,
          isScanning: false,
          connectionState: currentState === 'scanning' ? 'idle' : currentState,
        });
      },
      // On complete (timeout)
      () => {
        const { connectionState: currentState } = get();
        set({
          isScanning: false,
          connectionState: currentState === 'scanning' ? 'idle' : currentState,
        });
      }
    );
  },

  /**
   * Start scanning for BLE devices without filtering
   * Used by admins for band registration
   */
  startScanUnfiltered: async () => {
    const { bluetoothEnabled, hasPermissions, isScanning } = get();
    const { userDocument } = useAuthStore.getState();
    const isAdmin = userDocument?.role === 'org_admin' || userDocument?.role === 'super_admin';
    const hasOrganization = !!userDocument?.organizationId;

    if (isScanning) {
      return;
    }

    if (!bluetoothEnabled) {
      set({ error: 'Bluetooth is not enabled. Please enable Bluetooth.' });
      return;
    }

    if (!hasPermissions) {
      set({ error: 'Bluetooth permissions not granted.' });
      return;
    }

    set({
      isScanning: true,
      connectionState: 'scanning',
      discoveredDevices: [],
      error: null,
    });

    let assignedBandNames: string[] = [];

    if (!isAdmin && hasOrganization) {
      await get().fetchAssignedBands();
      assignedBandNames = get().assignedBands.map((b) => b.name.toLowerCase());
    }

    BLEManager.startScan(
      // On device found
      (device: BLEDevice, source?: 'connected' | 'scan') => {
        const { discoveredDevices, connectionState, connectedDevice } = get();

        if (source === 'connected') {
          const normalizedName = (device.name || device.localName || '').toLowerCase();
          const shouldAutoConnect = isAdmin
            ? true
            : hasOrganization
              ? assignedBandNames.includes(normalizedName)
              : true;

          if (
            shouldAutoConnect &&
            connectionState !== 'connecting' &&
            connectionState !== 'connected' &&
            connectedDevice?.id !== device.id
          ) {
            BLEManager.stopScan();
            set({ isScanning: false });
            get().connect(device.id).catch(() => undefined);
            return;
          }
        }

        if (
          !matchesDeviceForUser(device, isAdmin, hasOrganization, assignedBandNames)
        ) {
          return;
        }
        // Avoid duplicates
        if (!discoveredDevices.find((d) => d.id === device.id)) {
          set({ discoveredDevices: [...discoveredDevices, device] });
        }
      },
      // On error
      (errorMessage: string) => {
        const { connectionState: currentState } = get();
        set({
          error: errorMessage,
          isScanning: false,
          connectionState: currentState === 'scanning' ? 'idle' : currentState,
        });
      },
      // On complete (timeout)
      () => {
        const { connectionState: currentState } = get();
        set({
          isScanning: false,
          connectionState: currentState === 'scanning' ? 'idle' : currentState,
        });
      }
    );
  },

  /**
   * Stop scanning for devices
   */
  stopScan: () => {
    BLEManager.stopScan();
    const { connectionState: currentState } = get();
    set({
      isScanning: false,
      connectionState: currentState === 'scanning' ? 'idle' : currentState,
    });
  },

  /**
   * Clear discovered devices list
   */
  clearDiscoveredDevices: () => {
    set({ discoveredDevices: [] });
  },

  /**
   * Connect to a device
   */
  connect: async (deviceId: string) => {
    // Guard against concurrent connect calls
    const { connectionState: currentState } = get();
    if (currentState === 'connecting') {
      console.log('[BLE Store] Already connecting, ignoring duplicate connect call');
      return;
    }

    // Capture whether this connect was triggered by auto-reconnect
    // BEFORE stopAutoReconnect clears the flag.
    const isReconnect = reconnectInFlight;
    const savedReconnectName = isReconnect ? get().reconnectingDeviceName : null;

    // Stop any active scans before connecting
    BLEManager.stopScan();
    
    set({
      connectionState: 'connecting',
      error: null,
    });

    set({ isScanning: false });
    get().stopAutoReconnect();

    // During auto-reconnect, preserve the device name so the UI can show
    // "Reconnecting..." instead of "Connecting...".
    if (isReconnect && savedReconnectName) {
      set({ reconnectingDeviceName: savedReconnectName });
    }

    manualDisconnectInProgress = false;

    // Reset low battery flag for new connection
    lowBatteryReported = false;

    // Set up an overall timeout to recover from a stuck 'connecting' state
    let connectTimedOut = false;
    const connectTimeoutId = setTimeout(() => {
      connectTimedOut = true;
      const { connectionState: state } = get();
      if (state === 'connecting') {
        console.log('[BLE Store] Connect flow timed out after', CONNECT_TIMEOUT_MS, 'ms — resetting to idle');
        set({
          connectionState: 'idle',
          // Only show error for manual connections; during auto-reconnect
          // the retry loop handles it silently.
          error: isReconnect ? null : 'Connection timed out — please try again.',
        });
      }
    }, CONNECT_TIMEOUT_MS);

    try {
      console.log('[BLE Store] Step 1: BLEManager.connect...');
      const device = await BLEManager.connect(deviceId, (batteryStatus) => {
        const previousLevel = get().batteryLevel;
        set({
          batteryLevel: batteryStatus.level,
          isCharging: batteryStatus.isCharging,
        });

        // Check for low battery and log if not already reported
        if (
          batteryStatus.level <= LOW_BATTERY_THRESHOLD &&
          !batteryStatus.isCharging &&
          !lowBatteryReported
        ) {
          const connectedDevice = get().connectedDevice;
          const bandName = connectedDevice?.name || 'Unknown Band';
          ActivityLogService.logLowBattery(bandName, batteryStatus.level);
          lowBatteryReported = true;
        }

        // Update band battery level in Firebase
        const connectedDevice = get().connectedDevice;
        if (connectedDevice?.name) {
          const { userDocument } = useAuthStore.getState();
          if (userDocument?.organizationId) {
            FirestoreService.updateBandStatus(
              connectedDevice.name,
              userDocument.organizationId,
              { batteryLevel: batteryStatus.level }
            ).catch(console.error);
          }
        }
      });

      // If the timeout already fired, bail out
      if (connectTimedOut) {
        console.log('[BLE Store] Connect completed but timeout already fired, aborting');
        return;
      }

      // Steps 2-3: Read battery and firmware.
      // Skip in background -- these use JS timeouts that don't fire reliably,
      // which would cause the entire connect flow to hang.
      const isInForeground = AppState.currentState === 'active';
      let batteryStatus = null;
      let firmwareVersion = null;

      if (isInForeground) {
        console.log('[BLE Store] Step 2: Reading battery (with retry)...');
        for (let attempt = 0; attempt < 3; attempt++) {
          if (!(await BLEManager.isConnected())) {
            console.log('[BLE Store] Device disconnected before readBattery, aborting');
            break;
          }
          try {
            batteryStatus = await BLEManager.readBattery();
            break;
          } catch (err: any) {
            console.log(`[BLE Store] readBattery attempt ${attempt + 1}/3 failed:`, err?.message || err);
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        }
        if (batteryStatus) {
          set({
            batteryLevel: batteryStatus.level,
            isCharging: batteryStatus.isCharging,
          });

          if (
            batteryStatus.level <= LOW_BATTERY_THRESHOLD &&
            !batteryStatus.isCharging &&
            !lowBatteryReported
          ) {
            const bandName = device.name || 'Unknown Band';
            ActivityLogService.logLowBattery(bandName, batteryStatus.level);
            lowBatteryReported = true;
          }
        }

        if (connectTimedOut) return;

        console.log('[BLE Store] Step 3: Reading firmware version (with retry)...');
        for (let attempt = 0; attempt < 3; attempt++) {
          if (!(await BLEManager.isConnected())) {
            console.log('[BLE Store] Device disconnected before readFirmwareVersion, aborting');
            break;
          }
          try {
            firmwareVersion = await BLEManager.readFirmwareVersion();
            break;
          } catch (err: any) {
            console.log(`[BLE Store] readFirmwareVersion attempt ${attempt + 1}/3 failed:`, err?.message || err);
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        }

        if (connectTimedOut) return;
      } else {
        console.log('[BLE Store] Steps 2-3: Skipping reads (background)');
      }

      console.log('[BLE Store] Step 4: Setting up subscriptions (with retry)...');
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!(await BLEManager.isConnected())) {
          console.log('[BLE Store] Device disconnected before subscribeToNotifications, aborting');
          break;
        }
        try {
          BLEManager.subscribeToNotifications((notificationData: string) => {
            console.log('[BLE Store] Notification received:', notificationData);
            NotificationService.processNotification(notificationData);
          });
          break;
        } catch (err: any) {
          console.log(`[BLE Store] subscribeToNotifications attempt ${attempt + 1}/3 failed:`, err?.message || err);
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      }

      // Clean up previous disconnect subscription to prevent double-fire
      if (disconnectSubscription) {
        disconnectSubscription();
        disconnectSubscription = null;
      }
      // Reset the one-shot guard for this new connection
      disconnectHandled = false;

      // Monitor disconnection (one-shot: only fires once per connection)
      disconnectSubscription = BLEManager.onDeviceDisconnected(() => {
        // Prevent this handler from firing more than once
        if (disconnectHandled) {
          console.log('[BLE Store] Disconnect handler already fired, ignoring duplicate');
          return;
        }
        disconnectHandled = true;

        console.log('[BLE Store] Device disconnected');
        const disconnectedDevice = get().connectedDevice;
        const currentBattery = get().batteryLevel;
        get().stopBandHeartbeat();

        // Clean up this subscription immediately
        if (disconnectSubscription) {
          disconnectSubscription();
          disconnectSubscription = null;
        }

        set({
          connectionState: 'idle',
          connectedDevice: null,
          batteryLevel: null,
          isCharging: false,
          firmwareVersion: null,
        });

        // Log disconnection event
        if (disconnectedDevice?.name) {
          ActivityLogService.logBandDisconnected(disconnectedDevice.name, 'connection_lost');

          // Update band status in Firebase
          const { userDocument } = useAuthStore.getState();
          if (userDocument?.organizationId) {
            FirestoreService.updateBandStatus(
              disconnectedDevice.name,
              userDocument.organizationId,
              {
                lastDisconnected: true,
                isConnected: false,
                batteryLevel: currentBattery,
              }
            ).catch(console.error);
          }
        }

        if (!manualDisconnectInProgress) {
          // Update the foreground notification to show reconnecting state
          const reconnectName = disconnectedDevice?.name || 'Safewave Band';
          ForegroundServiceManager.updateService(reconnectName, 'reconnecting');

          get().startAutoReconnect(disconnectedDevice?.id, disconnectedDevice?.name || undefined);
        } else {
          // Manual disconnect — stop the foreground service entirely
          ForegroundServiceManager.stopService();
        }
      });

      // Clear the timeout since we completed successfully
      clearTimeout(connectTimeoutId);

      if (connectTimedOut) return;

      console.log('[BLE Store] Step 5: Setting connected state');
      set({
        connectionState: 'connected',
        connectedDevice: device,
        firmwareVersion,
      });

      get().stopAutoReconnect();
      set({ isScanning: false, reconnectingDeviceName: null });

      // Log successful connection
      const bandName = device.name || 'Unknown Band';
      ActivityLogService.logBandConnected(bandName);

      // Update band status in Firebase (lastConnected)
      const { userDocument } = useAuthStore.getState();
      if (userDocument?.organizationId && device.name) {
        FirestoreService.updateBandStatus(
          device.name,
          userDocument.organizationId,
          {
            lastConnected: true,
            isConnected: true,
            batteryLevel: batteryStatus?.level ?? null,
          }
        ).catch(console.error);
      }

      // Start heartbeat updates while connected
      get().startBandHeartbeat();

      // Start Android foreground service to keep the process alive in background
      ForegroundServiceManager.startService(bandName);
      console.log('[BLE Store] Connection flow complete — state: connected');
    } catch (error: any) {
      clearTimeout(connectTimeoutId);
      if (!connectTimedOut) {
        console.log('[BLE Store] Connect failed:', error.message);
        set({
          connectionState: 'idle',
          // Only show error for manual connections; during auto-reconnect
          // the retry loop handles it silently.
          error: isReconnect ? null : (error.message || 'Failed to connect'),
        });
      }
      throw error;
    }
  },

  /**
   * Disconnect from the current device
   */
  disconnect: async () => {
    const disconnectingDevice = get().connectedDevice;
    const currentBattery = get().batteryLevel;

    set({ connectionState: 'disconnecting' });
    manualDisconnectInProgress = true;
    get().stopBandHeartbeat();
    get().stopAutoReconnect();

    // Stop the Android foreground service
    ForegroundServiceManager.stopService();

    try {
      await BLEManager.disconnect();

      // Log disconnection event
      if (disconnectingDevice?.name) {
        ActivityLogService.logBandDisconnected(disconnectingDevice.name, 'user_initiated');

        // Update band status in Firebase
        const { userDocument } = useAuthStore.getState();
        if (userDocument?.organizationId) {
          FirestoreService.updateBandStatus(
            disconnectingDevice.name,
            userDocument.organizationId,
            {
              lastDisconnected: true,
              isConnected: false,
              batteryLevel: currentBattery,
            }
          ).catch(console.error);
        }
      }

      set({
        connectionState: 'idle',
        connectedDevice: null,
        batteryLevel: null,
        isCharging: false,
        firmwareVersion: null,
      });
      manualDisconnectInProgress = false;
    } catch (error: any) {
      set({
        connectionState: 'idle',
        connectedDevice: null,
        firmwareVersion: null,
        error: error.message || 'Failed to disconnect',
      });
      manualDisconnectInProgress = false;
    }
  },

  startBandHeartbeat: () => {
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
    }

    const tick = () => {
      const { connectedDevice, batteryLevel } = get();
      const { userDocument } = useAuthStore.getState();
      const bandName = connectedDevice?.name;
      const organizationId = userDocument?.organizationId;

      if (!bandName || !organizationId) {
        return;
      }

      FirestoreService.updateBandHeartbeat(bandName, organizationId, batteryLevel ?? null)
        .catch(console.error);
    };

    // Run immediately, then every interval
    tick();
    heartbeatIntervalId = setInterval(tick, HEARTBEAT_INTERVAL_MS);
  },

  stopBandHeartbeat: () => {
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
    }
  },

  /**
   * Send vibration command to the band
   */
  vibrate: async (command: VibrationCommand) => {
    const { connectedDevice } = get();

    if (!connectedDevice) {
      set({ error: 'No device connected' });
      return;
    }

    try {
      await BLEManager.vibrate(command);
    } catch (error: any) {
      set({ error: error.message || 'Failed to send vibration' });
      throw error;
    }
  },

  /**
   * Send a test vibration
   */
  testVibration: async () => {
    await get().vibrate(DEFAULT_VIBRATION);
  },

  /**
   * Read firmware version from the connected band
   */
  readFirmwareVersion: async () => {
    const { connectedDevice } = get();

    if (!connectedDevice) {
      return null;
    }

    try {
      const firmwareVersion = await BLEManager.readFirmwareVersion();
      set({ firmwareVersion });
      return firmwareVersion;
    } catch (error: any) {
      console.error('[BLE Store] Error reading firmware version:', error);
      return null;
    }
  },

  /**
   * Rename the connected band
   */
  renameBand: async (name: string) => {
    console.log('[BLE Store] renameBand called with name:', name);
    const { connectedDevice } = get();

    if (!connectedDevice) {
      console.log('[BLE Store] renameBand FAILED: No device connected');
      set({ error: 'No device connected' });
      return;
    }

    console.log('[BLE Store] Connected device:', connectedDevice.id, connectedDevice.name);

    try {
      console.log('[BLE Store] Calling BLEManager.renameBand...');
      const renameStartTime = Date.now();
      await BLEManager.renameBand(name);
      const renameDuration = Date.now() - renameStartTime;
      console.log('[BLE Store] BLEManager.renameBand COMPLETE', { duration: `${renameDuration}ms` });
      
      // Update the connected device name in state
      console.log('[BLE Store] Updating connected device state with new name...');
      set({
        connectedDevice: {
          ...connectedDevice,
          name,
        },
      });
      console.log('[BLE Store] State updated successfully');
      console.log('[BLE Store] renameBand COMPLETE');
    } catch (error: any) {
      console.error('[BLE Store] renameBand FAILED:', error);
      console.error('[BLE Store] Error details:', {
        message: error.message,
        code: error.code,
      });
      set({ error: error.message || 'Failed to rename band' });
      throw error;
    }
  },

  /**
   * Write app settings to the connected band
   * @param apps Array of enabled apps with their configurations
   */
  writeAppSettings: async (apps: Array<{
    bundleIdentifier: string;
    config: { strength: number; numberOfVibrations: number };
  }>) => {
    const { connectedDevice } = get();

    if (!connectedDevice) {
      set({ error: 'No device connected' });
      return;
    }

    try {
      await BLEManager.writeAppSettings(apps);
      console.log('[BLE Store] App settings written successfully');
    } catch (error: any) {
      set({ error: error.message || 'Failed to write app settings' });
      throw error;
    }
  },

  /**
   * Set error message
   */
  setError: (error: string | null) => {
    set({ error });
  },

  /**
   * Clear error message
   */
  clearError: () => {
    set({ error: null });
  },

  /**
   * Reset store to initial state
   */
  reset: () => {
    ForegroundServiceManager.stopService();
    BLEManager.destroy();
    set(initialState);
  },
}));
