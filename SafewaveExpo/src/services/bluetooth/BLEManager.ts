import { Platform, PermissionsAndroid, AppState } from 'react-native';
import { BleManager, Device, State, BleError, ConnectionPriority } from 'react-native-ble-plx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BLEDevice,
  VibrationCommand,
  BatteryStatus,
  StoredDevice,
} from '../../types/bluetooth';
import {
  MAIN_SERVICE_UUID,
  HID_SERVICE_UUID,
  BATTERY_SERVICE_UUID,
  DEVICE_INFO_SERVICE_UUID,
  OTA_SERVICE_UUID,
  VIBRATION_CHAR_UUID,
  BATTERY_CHAR_UUID,
  DISPLAY_NAME_CHAR_UUID,
  FIRMWARE_VERSION_CHAR_UUID,
  APP_SETTINGS_CHAR_UUID,
  SCAN_SERVICE_UUIDS,
  SCAN_TIMEOUT_MS,
  STORAGE_KEY_LAST_DEVICE,
  isValidDeviceName,
  DEFAULT_VIBRATION_STRENGTH,
  DEFAULT_NUM_BUZZES,
  DEFAULT_DUTY_CYCLE,
  DEFAULT_BUZZ_DELAY,
} from './BLEConstants';

// Base64 encoding/decoding for React Native (no Buffer dependency)
const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encode a byte array to base64 string
 */
const bytesToBase64 = (bytes: number[]): string => {
  let result = '';
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    result += base64Chars[b1 >> 2];
    result += base64Chars[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < len ? base64Chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < len ? base64Chars[b3 & 63] : '=';
  }

  return result;
};

/**
 * Decode a base64 string to byte array
 */
const base64ToBytes = (base64: string): number[] => {
  const bytes: number[] = [];
  const len = base64.length;

  for (let i = 0; i < len; i += 4) {
    const c1 = base64Chars.indexOf(base64[i]);
    const c2 = base64Chars.indexOf(base64[i + 1]);
    const c3 = base64[i + 2] === '=' ? 0 : base64Chars.indexOf(base64[i + 2]);
    const c4 = base64[i + 3] === '=' ? 0 : base64Chars.indexOf(base64[i + 3]);

    bytes.push((c1 << 2) | (c2 >> 4));
    if (base64[i + 2] !== '=') {
      bytes.push(((c2 & 15) << 4) | (c3 >> 2));
    }
    if (base64[i + 3] !== '=') {
      bytes.push(((c3 & 3) << 6) | c4);
    }
  }

  return bytes;
};

// Singleton BleManager instance
let bleManagerInstance: BleManager | null = null;

// Callback invoked when iOS restores a previously connected peripheral
let restoredDeviceCallback: ((deviceId: string) => void) | null = null;

// Connected device reference
let connectedDevice: Device | null = null;

// Incremented each time a new connection is established.
// Used to detect stale disconnect callbacks from previous connections.
let connectionGeneration = 0;

// Callback fired when a subscription error suggests the device disconnected
// but the onDeviceDisconnected handler hasn't fired yet.
let subscriptionErrorCallback: (() => void) | null = null;

// Battery subscription reference
let batterySubscription: { remove: () => void } | null = null;

// Notification subscription reference
let notificationSubscription: { remove: () => void } | null = null;

// Scan timeout reference
let scanTimeoutId: NodeJS.Timeout | null = null;

// Track if a scan is currently active
let isScanActive = false;

// Track which devices we've already logged during the current scan to avoid spam
let discoveredDeviceIdsThisScan = new Set<string>();

// Track scan errors to avoid logging the same error repeatedly
let lastScanErrorMsg = '';
let scanErrorCount = 0;

// Minimum interval between scan starts to prevent rapid cycling
const MIN_SCAN_INTERVAL_MS = 2000;
let lastScanStartTime = 0;

// Delay after service discovery on Android to allow pairing to complete
const ANDROID_PAIRING_DELAY_MS = 3000;

/**
 * Retry a BLE operation with backoff.
 * Useful for operations that may fail if Android pairing hasn't completed yet.
 */
const retryBleOperation = async <T>(
  label: string,
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1500
): Promise<T> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      console.log(`[BLE] ${label} attempt ${attempt + 1}/${maxRetries} failed:`, error?.message || error);
      if (attempt === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Retry exhausted');
};

/**
 * Get or create the BleManager singleton.
 * On iOS, passes a restoreStateIdentifier so CoreBluetooth can restore
 * the BLE connection after the app is terminated and relaunched by the system.
 */
const getBleManager = (): BleManager => {
  if (!bleManagerInstance) {
    if (Platform.OS === 'ios') {
      bleManagerInstance = new BleManager({
        restoreStateIdentifier: 'com.safewave.ble.restore',
        restoreStateFunction: (restoredState) => {
          if (restoredState?.connectedPeripherals?.length) {
            console.log(
              '[BLE] iOS state restoration: found',
              restoredState.connectedPeripherals.length,
              'peripherals'
            );
            // Notify the store so it can reconnect to the restored device
            const firstDevice = restoredState.connectedPeripherals[0];
            if (firstDevice && restoredDeviceCallback) {
              restoredDeviceCallback(firstDevice.id);
            }
          } else {
            console.log('[BLE] iOS state restoration: no peripherals to restore');
          }
        },
      });
    } else {
      bleManagerInstance = new BleManager();
    }
  }
  return bleManagerInstance;
};

/**
 * Convert react-native-ble-plx Device to our BLEDevice type
 */
const mapDevice = (device: Device): BLEDevice => ({
  id: device.id,
  name: device.name,
  rssi: device.rssi,
  localName: device.localName,
  isConnectable: device.isConnectable,
  serviceUUIDs: device.serviceUUIDs,
});

/**
 * Request Bluetooth permissions (Android only)
 */
const requestAndroidPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  try {
    const apiLevel = Platform.Version;

    if (apiLevel >= 31) {
      // Android 12+ — BLUETOOTH_SCAN uses neverForLocation, no location permission needed
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      return (
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
      );
    } else {
      // Android 11 and below
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return result === 'granted';
    }
  } catch (error) {
    console.error('Error requesting permissions:', error);
    return false;
  }
};

/**
 * BLE Manager Service
 */
export const BLEManager = {
  /**
   * Initialize the BLE manager and check permissions
   */
  initialize: async (): Promise<{ hasPermissions: boolean; bluetoothEnabled: boolean }> => {
    const manager = getBleManager();

    // Request permissions on Android
    const hasPermissions = await requestAndroidPermissions();

    // Check Bluetooth state
    const state = await manager.state();
    const bluetoothEnabled = state === State.PoweredOn;

    return { hasPermissions, bluetoothEnabled };
  },

  /**
   * Subscribe to Bluetooth state changes
   */
  onStateChange: (callback: (state: State) => void): (() => void) => {
    const manager = getBleManager();
    const subscription = manager.onStateChange(callback, true);
    return () => subscription.remove();
  },

  /**
   * Check if Bluetooth is enabled
   */
  isBluetoothEnabled: async (): Promise<boolean> => {
    const manager = getBleManager();
    const state = await manager.state();
    return state === State.PoweredOn;
  },

  /**
   * Get devices that are already connected to the phone
   */
  getConnectedDevices: async (): Promise<BLEDevice[]> => {
    const manager = getBleManager();

    try {
      // Check for devices connected with Safewave main service UUID
      const mainServiceDevices = await manager.connectedDevices([MAIN_SERVICE_UUID]);

      // Check for devices connected with HID service (used for pairing)
      const hidDevices = await manager.connectedDevices([HID_SERVICE_UUID]);

      // Check with both services at once
      const bothServicesDevices = await manager.connectedDevices([MAIN_SERVICE_UUID, HID_SERVICE_UUID]);

      // Combine and deduplicate
      const allDevices = [...mainServiceDevices, ...hidDevices, ...bothServicesDevices];
      const uniqueDevices = allDevices.filter(
        (device, index, self) => self.findIndex((d) => d.id === device.id) === index
      );

      // Filter for valid Safewave devices and map to our type
      const result = uniqueDevices
        .filter((device) => {
          const deviceName = device.name || device.localName;
          return isValidDeviceName(deviceName) || deviceName;
        })
        .map(mapDevice);

      if (result.length > 0) {
        console.log('[BLE] Found', result.length, 'already connected device(s):', result.map(d => d.name).join(', '));
      }
      return result;
    } catch (error) {
      console.error('[BLE] Error getting connected devices:', error);
      return [];
    }
  },

  /**
   * Start scanning for BLE devices
   */
  startScan: async (
    onDeviceFound: (device: BLEDevice, source?: 'connected' | 'scan') => void,
    onError: (error: string) => void,
    onComplete?: () => void
  ): Promise<void> => {
    const manager = getBleManager();

    // Prevent overlapping scans
    if (isScanActive) {
      return;
    }

    // Prevent rapid scan cycling (minimum 2s between scans)
    const now = Date.now();
    const timeSinceLastScan = now - lastScanStartTime;
    if (timeSinceLastScan < MIN_SCAN_INTERVAL_MS) {
      return;
    }
    lastScanStartTime = now;

    console.log('[BLE] Starting scan...');

    // Clear any existing timeout
    if (scanTimeoutId) {
      clearTimeout(scanTimeoutId);
      scanTimeoutId = null;
    }

    // Stop any existing scan
    try {
      manager.stopDeviceScan();
    } catch (error) {
      // Ignore errors stopping previous scan
    }

    // Mark scan as active and reset per-scan tracking
    isScanActive = true;
    discoveredDeviceIdsThisScan.clear();
    lastScanErrorMsg = '';
    scanErrorCount = 0;

    // First, check for already connected devices
    try {
      const alreadyConnected = await BLEManager.getConnectedDevices();
      alreadyConnected.forEach((device) => {
        onDeviceFound(device, 'connected');
      });
    } catch (error) {
      console.error('[BLE] Error checking connected devices:', error);
    }

    // Scan using Safewave service UUIDs only
    try {
      manager.startDeviceScan(
        SCAN_SERVICE_UUIDS,
        { allowDuplicates: false },
        (error: BleError | null, device: Device | null) => {
          if (error) {
            const msg = error.message || 'Scan failed';
            // Suppress duplicate "Cannot start scanning" errors
            if (msg.includes('Cannot start scanning operation')) {
              if (lastScanErrorMsg !== msg) {
                console.warn('[BLE] Scan error: Cannot start scanning operation');
                lastScanErrorMsg = msg;
                scanErrorCount = 1;
              } else {
                scanErrorCount++;
              }
              return;
            }
            console.error('[BLE] Scan error:', msg);
            onError(msg);
            return;
          }

          if (device) {
            // Only log the first time we see a device in this scan
            if (!discoveredDeviceIdsThisScan.has(device.id)) {
              discoveredDeviceIdsThisScan.add(device.id);
              const deviceName = device.name || device.localName;
              console.log('[BLE] Discovered device:', device.id, 'name:', deviceName, 'rssi:', device.rssi);
            }
            onDeviceFound(mapDevice(device), 'scan');
          }
        }
      );
    } catch (error: any) {
      console.error('[BLE] Error starting scan:', error);
      isScanActive = false;
      onError(error.message || 'Failed to start scan');
      return;
    }

    // Set scan timeout
    scanTimeoutId = setTimeout(() => {
      BLEManager.stopScan();
      onComplete?.();
    }, SCAN_TIMEOUT_MS);
  },

  /**
   * Stop scanning for devices
   */
  stopScan: (): void => {
    const manager = getBleManager();
    const wasActive = isScanActive;
    
    try {
      manager.stopDeviceScan();
    } catch (error) {
      // Ignore errors when stopping scan
    }

    if (scanTimeoutId) {
      clearTimeout(scanTimeoutId);
      scanTimeoutId = null;
    }

    // Only log if scan was actually running
    if (wasActive) {
      // Log suppressed scan error count if any
      if (scanErrorCount > 1) {
        console.warn('[BLE] Suppressed', scanErrorCount - 1, 'duplicate scan errors');
      }
      console.log('[BLE] Scan stopped');
    }

    // Mark scan as inactive
    isScanActive = false;
  },

  /**
   * Connect to a device
   */
  connect: async (
    deviceId: string,
    onBatteryUpdate?: (status: BatteryStatus) => void
  ): Promise<BLEDevice> => {
    const manager = getBleManager();

    // Stop scanning if active
    BLEManager.stopScan();

    try {
      // If already connected, reuse the existing connection
      const connectedDevices = await manager.connectedDevices([
        MAIN_SERVICE_UUID,
        HID_SERVICE_UUID,
        BATTERY_SERVICE_UUID,
        DEVICE_INFO_SERVICE_UUID,
        OTA_SERVICE_UUID,
      ]);
      const alreadyConnected = connectedDevices.find((d) => d.id === deviceId);
      let isAlreadyConnected = false;
      if (alreadyConnected) {
        try {
          isAlreadyConnected = await alreadyConnected.isConnected();
        } catch {
          isAlreadyConnected = false;
        }
      }

      if (alreadyConnected && isAlreadyConnected) {
        console.log('[BLE] Device already connected, reusing connection:', deviceId);
      }

      // Connect to device if not already connected
      let device: Device;
      if (alreadyConnected && isAlreadyConnected) {
        device = alreadyConnected;
      } else {
        try {
          // Wrap connection in timeout handler to catch library-level timeout errors
          device = await Promise.race([
            manager.connectToDevice(deviceId, {
              autoConnect: false,
              timeout: 15000, // Increased timeout to 15 seconds
            }),
            new Promise<Device>((_, reject) => 
              setTimeout(() => reject(new Error('Connection timeout - device did not respond in time')), 15000)
            )
          ]);
        } catch (connectionError: any) {
          // Handle specific error cases
          const errorMessage = connectionError?.message || '';
          const errorCode = connectionError?.errorCode;
          
          // Check for timeout-related errors
          if (errorMessage.includes('timeout') || 
              errorMessage.includes('timed out') ||
              errorMessage.includes('did not respond')) {
            throw new Error('Connection timeout - the device is not responding. Please make sure the device is nearby and try again.');
          }
          
          // Check for device not found errors
          if (errorMessage.includes('not found') || 
              errorMessage.includes('Device with') ||
              errorCode === 205) {
            throw new Error('Device not found - the device may be out of range or turned off.');
          }
          
          // Check for permission errors
          if (errorMessage.includes('permission') || 
              errorMessage.includes('unauthorized') ||
              errorCode === 601) {
            throw new Error('Bluetooth permission denied - please enable Bluetooth permissions in settings.');
          }
          
          // Check for Bluetooth disabled
          if (errorMessage.includes('powered off') || 
              errorMessage.includes('disabled') ||
              errorCode === 102) {
            throw new Error('Bluetooth is turned off - please enable Bluetooth and try again.');
          }
          
          // Generic error with sanitized message
          throw new Error(errorMessage || 'Failed to connect to device - please try again.');
        }
      }

      // Discover services and characteristics with error handling
      try {
        await device.discoverAllServicesAndCharacteristics();
      } catch (discoveryError: any) {
        console.error('[BLE] Service discovery failed:', discoveryError);
        
        // Try to disconnect the partially connected device
        try {
          await device.cancelConnection();
        } catch {
          // Ignore disconnect errors
        }
        
        throw new Error('Failed to discover device services - the device may not be compatible.');
      }

      // On Android in the foreground, service discovery of the HID service
      // triggers a pairing popup. Wait to give the OS time to complete the
      // bond key exchange before accessing any encrypted characteristics.
      // Skip this delay in background -- setTimeout doesn't fire reliably
      // when backgrounded, which would hang the entire connect flow.
      if (Platform.OS === 'android' && AppState.currentState === 'active') {
        console.log('[BLE] Waiting', ANDROID_PAIRING_DELAY_MS, 'ms for Android pairing to complete...');
        await new Promise(resolve => setTimeout(resolve, ANDROID_PAIRING_DELAY_MS));
        console.log('[BLE] Pairing delay complete');

        // Verify the device is still connected after the delay.
        // Bluetooth may have been toggled off during the wait, which
        // destroys the native GATT connection and causes a
        // NullPointerException if we try to use the device.
        try {
          const stillConnected = await device.isConnected();
          if (!stillConnected) {
            console.log('[BLE] Device disconnected during pairing delay');
            throw new Error('Device disconnected during pairing — please try again.');
          }
        } catch (checkError: any) {
          console.log('[BLE] Connection check failed after pairing delay:', checkError?.message);
          throw new Error('Device disconnected during pairing — please try again.');
        }
      } else if (Platform.OS === 'android') {
        console.log('[BLE] Skipping pairing delay (app is in background)');
      }

      // Request higher connection priority on Android to prevent background disconnections.
      // Without this, Android downgrades BLE connection parameters when backgrounded,
      // causing the band's supervision timeout to expire and disconnect.
      if (Platform.OS === 'android') {
        try {
          await device.requestConnectionPriority(ConnectionPriority.High);
          console.log('[BLE] Connection priority set to High');
        } catch (priorityError) {
          console.log('[BLE] Connection priority request failed (non-critical)');
        }
      }

      // Store connected device and bump generation to invalidate old disconnect handlers
      connectedDevice = device;
      connectionGeneration += 1;

      // Subscribe to battery updates (with retry in case pairing is still settling)
      if (onBatteryUpdate) {
        try {
          await retryBleOperation(
            'subscribeToBattery',
            async () => {
              if (!connectedDevice) throw new Error('Device disconnected');
              BLEManager.subscribeToBattery(onBatteryUpdate);
            },
          );
        } catch (batteryError) {
          console.log('[BLE] Battery subscription failed after retries, continuing without battery updates');
        }
      }

      // Store device info for auto-reconnect
      try {
        await BLEManager.storeLastDevice(mapDevice(device));
      } catch (storageError) {
        console.log('[BLE] Failed to store device info, continuing');
        // Non-critical error, continue connection
      }

      // Send confirmation vibration only on new foreground connections (with retry)
      if (!isAlreadyConnected && AppState.currentState === 'active') {
        try {
          await retryBleOperation(
            'confirmationVibration',
            async () => {
              if (!connectedDevice) throw new Error('Device disconnected');
              await BLEManager.vibrate({
                strength: 15,
                numBuzzes: 2,
                dutyOfBuzz: 10,
                durationOfDelay: 5,
              });
            },
          );
        } catch (vibrationError) {
          console.log('[BLE] Confirmation vibration failed after retries, continuing');
        }
      }

      return mapDevice(device);
    } catch (error: any) {
      // If the error is already a user-friendly message, rethrow it
      if (error.message && 
          (error.message.includes('timeout') ||
           error.message.includes('not found') ||
           error.message.includes('permission') ||
           error.message.includes('Bluetooth') ||
           error.message.includes('compatible'))) {
        throw error;
      }
      
      // Otherwise, provide a generic error message
      throw new Error('Failed to connect to device - please try again.');
    }
  },

  /**
   * Disconnect from the current device
   */
  disconnect: async (): Promise<void> => {
    if (!connectedDevice) return;

    try {
      // Remove battery subscription with error handling
      if (batterySubscription) {
        try {
          batterySubscription.remove();
        } catch (error) {
          console.log('[BLE] Battery subscription cleanup during disconnect');
        }
        batterySubscription = null;
      }

      // Remove notification subscription with error handling
      if (notificationSubscription) {
        try {
          notificationSubscription.remove();
        } catch (error) {
          console.log('[BLE] Notification subscription cleanup during disconnect');
        }
        notificationSubscription = null;
      }

      // Disconnect
      await connectedDevice.cancelConnection();
      connectedDevice = null;
    } catch (error: any) {
      console.error('Disconnect error:', error);
      connectedDevice = null;
    }
  },

  /**
   * Check if a device is connected
   */
  isConnected: async (): Promise<boolean> => {
    if (!connectedDevice) return false;
    try {
      return await connectedDevice.isConnected();
    } catch {
      return false;
    }
  },

  /**
   * Get the currently connected device
   */
  getConnectedDevice: (): BLEDevice | null => {
    return connectedDevice ? mapDevice(connectedDevice) : null;
  },

  /**
   * Get the raw react-native-ble-plx Device handle for the current
   * connection. Used by OTAManager for direct characteristic I/O on the
   * OTA service. Returns null if not connected.
   */
  getRawConnectedDevice: (): Device | null => connectedDevice,

  /**
   * Subscribe to battery status updates
   */
  subscribeToBattery: (callback: (status: BatteryStatus) => void): void => {
    if (!connectedDevice) return;

    // Remove existing subscription with try-catch to handle BLE library bugs
    if (batterySubscription) {
      try {
        batterySubscription.remove();
      } catch (error) {
        // Ignore errors during subscription removal
        console.log('[BLE] Battery subscription removal completed');
      }
      batterySubscription = null;
    }

    // Capture reference to avoid using a stale connectedDevice
    const device = connectedDevice;
    if (!device) return;

    batterySubscription = device.monitorCharacteristicForService(
      MAIN_SERVICE_UUID,
      BATTERY_CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          const errorMessage = error.message || '';
          const isDisconnectionError =
            errorMessage.includes('disconnected') ||
            errorMessage.includes('cancelled') ||
            errorMessage.includes('powered off') ||
            errorMessage.includes('notify change failed') ||
            error.errorCode === 201 || // Device disconnected
            error.errorCode === 2;     // Operation cancelled

          if (!isDisconnectionError) {
            console.error('Battery subscription error:', error);
          }
          // Notify that device likely disconnected — backup for when onDeviceDisconnected doesn't fire
          if (subscriptionErrorCallback) {
            subscriptionErrorCallback();
          }
          return;
        }

        if (characteristic?.value) {
          // Decode base64 value
          const bytes = base64ToBytes(characteristic.value);
          if (bytes.length >= 2) {
            callback({
              level: bytes[0],
              isCharging: bytes[1] === 1,
            });
          }
        }
      }
    );
  },

  /**
   * Read current battery status (with timeout to prevent hanging)
   */
  readBattery: async (): Promise<BatteryStatus | null> => {
    if (!connectedDevice) return null;

    // Verify the native connection is still alive to avoid NullPointerException
    try {
      const stillConnected = await connectedDevice.isConnected();
      if (!stillConnected) {
        console.log('[BLE] readBattery: device no longer connected');
        return null;
      }
    } catch {
      return null;
    }

    try {
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          console.log('[BLE] readBattery timed out after 5s');
          resolve(null);
        }, 5000);
      });

      const characteristic = await Promise.race([
        connectedDevice.readCharacteristicForService(
          MAIN_SERVICE_UUID,
          BATTERY_CHAR_UUID
        ),
        timeoutPromise,
      ]);

      clearTimeout(timeoutId!);

      if (characteristic?.value) {
        const bytes = base64ToBytes(characteristic.value);
        if (bytes.length >= 2) {
          return {
            level: bytes[0],
            isCharging: bytes[1] === 1,
          };
        }
      }
      return null;
    } catch (error) {
      console.error('Error reading battery:', error);
      return null;
    }
  },

  /**
   * Subscribe to notification source from the band
   * Receives notification data when apps trigger the band
   */
  subscribeToNotifications: (callback: (data: string) => void): void => {
    if (!connectedDevice) return;

    // Remove existing subscription with try-catch to handle BLE library bugs
    if (notificationSubscription) {
      try {
        notificationSubscription.remove();
      } catch (error) {
        // Ignore errors during subscription removal
        console.log('[BLE] Notification subscription removal completed');
      }
      notificationSubscription = null;
    }

    console.log('[BLE] Subscribing to notifications on APP_SETTINGS_CHAR_UUID...');

    // Capture reference to avoid using a stale connectedDevice
    const device = connectedDevice;
    if (!device) return;

    notificationSubscription = device.monitorCharacteristicForService(
      MAIN_SERVICE_UUID,
      APP_SETTINGS_CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          // Check if this is an expected disconnection error
          const errorMessage = error.message || '';
          const isDisconnectionError =
            errorMessage.includes('disconnected') ||
            errorMessage.includes('cancelled') ||
            errorMessage.includes('powered off') ||
            errorMessage.includes('notify change failed') ||
            error.errorCode === 201 || // Device disconnected
            error.errorCode === 2;     // Operation cancelled

          if (!isDisconnectionError) {
            console.error('[BLE] Notification subscription error:', error);
          }
          // Notify that device likely disconnected — backup for when onDeviceDisconnected doesn't fire
          if (subscriptionErrorCallback) {
            subscriptionErrorCallback();
          }
          return;
        }

        if (characteristic?.value) {
          // Decode base64 value to bytes
          const bytes = base64ToBytes(characteristic.value);

          if (bytes.length >= 1) {
            try {
              // Convert bytes to string chunk-by-chunk to avoid stack overflow
              // from spread operator on large arrays
              let notificationData = '';
              const chunkSize = 8192;
              for (let i = 0; i < bytes.length; i += chunkSize) {
                notificationData += String.fromCharCode(
                  ...bytes.slice(i, Math.min(i + chunkSize, bytes.length))
                );
              }

              console.log('[BLE] ========== NOTIFICATION RECEIVED ==========');
              console.log('[BLE] Raw bytes:', bytes);
              console.log('[BLE] Parsed string:', notificationData);
              console.log('[BLE] =============================================');

              callback(notificationData);
            } catch (parseError) {
              console.error('[BLE] Failed to parse notification bytes:', parseError);
            }
          }
        }
      }
    );

    console.log('[BLE] Notification subscription active');
  },

  /**
   * Unsubscribe from notifications
   */
  unsubscribeFromNotifications: (): void => {
    if (notificationSubscription) {
      try {
        notificationSubscription.remove();
      } catch (error) {
        // Ignore errors during subscription removal
        console.log('[BLE] Notification subscription cleanup completed');
      }
      notificationSubscription = null;
      console.log('[BLE] Notification subscription removed');
    }
  },

  /**
   * Convert app list to the band's string format
   * Format: " bundleId, strength, numBuzzes, dutyOfBuzz, durationOfDelay;"
   */
  convertAppsToString: (apps: Array<{
    bundleIdentifier: string;
    config: { strength: number; numberOfVibrations: number };
  }>): string => {
    let result = '';

    for (const app of apps) {
      const bundleId = app.bundleIdentifier;
      const strength = Math.floor(app.config.strength);
      const numBuzzes = Math.floor(app.config.numberOfVibrations);
      const dutyOfBuzz = 50; // Default
      const durationOfDelay = 50; // Default

      let formattedString = ` ${bundleId}, ${strength}, ${numBuzzes}, ${dutyOfBuzz}, ${durationOfDelay};`;

      // Check for the appID text size condition (if UTF-8 length % 20 === 0, add extra semicolon)
      const encoder = new TextEncoder();
      if (encoder.encode(bundleId).length % 20 === 0) {
        formattedString += ';';
      }

      result += formattedString;
    }

    return result;
  },

  /**
   * Write app settings to the band
   * Converts app list to string format and writes in chunks with retry logic
   * @param apps Array of enabled apps with their configurations
   * @param maxRetries Maximum number of retry attempts (default: 30)
   * @param retryDelayMs Delay between retries in milliseconds (default: 1000)
   */
  writeAppSettings: async (
    apps: Array<{
      bundleIdentifier: string;
      config: { strength: number; numberOfVibrations: number };
    }>,
    maxRetries: number = 30,
    retryDelayMs: number = 1000
  ): Promise<void> => {
    if (!connectedDevice || apps.length === 0) {
      console.log('[BLE] No device connected or no apps to write');
      return;
    }

    // Convert apps to string format
    const appString = BLEManager.convertAppsToString(apps);
    console.log('[BLE] App settings string:', appString);
    console.log('[BLE] App settings string length:', appString.length);

    // Convert string to UTF-8 bytes
    const encoder = new TextEncoder();
    const dataToSend = Array.from(encoder.encode(appString));
    console.log('[BLE] Data bytes length:', dataToSend.length);

    // Default MTU size for BLE (conservative, actual MTU may be higher)
    const mtuSize = 20;

    // Retry loop
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Check device is still connected before each attempt
      if (!connectedDevice) {
        throw new Error('Device disconnected during app settings write');
      }
      try {
        const stillConnected = await connectedDevice.isConnected();
        if (!stillConnected) {
          throw new Error('Device disconnected during app settings write');
        }
      } catch (checkError: any) {
        throw new Error('Device disconnected during app settings write');
      }

      try {
        console.log(`[BLE] Writing app settings attempt ${attempt + 1}/${maxRetries}...`);

        // Write data in chunks to handle MTU limitations
        for (let i = 0; i < dataToSend.length; i += mtuSize) {
          const chunk = dataToSend.slice(i, Math.min(i + mtuSize, dataToSend.length));
          const base64Chunk = bytesToBase64(chunk);

          await connectedDevice.writeCharacteristicWithResponseForService(
            MAIN_SERVICE_UUID,
            APP_SETTINGS_CHAR_UUID,
            base64Chunk
          );

          // Small delay between chunks to avoid write without response issues
          if (i + mtuSize < dataToSend.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        console.log('[BLE] App settings written successfully');
        return; // Success, exit retry loop

      } catch (error: any) {
        console.error(`[BLE] Error writing app settings (attempt ${attempt + 1}):`, error.message);

        // If device disconnected, don't retry
        if (error.message?.includes('disconnected')) {
          throw error;
        }

        if (attempt < maxRetries - 1) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        } else {
          // Final attempt failed
          throw new Error(`Failed to write app settings after ${maxRetries} attempts: ${error.message}`);
        }
      }
    }
  },

  /**
   * Send a vibration command to the band
   */
  vibrate: async (command: VibrationCommand): Promise<void> => {
    // Capture device reference to avoid null between check and write
    const device = connectedDevice;
    if (!device) {
      throw new Error('No device connected');
    }

    // Verify the native connection is still alive to avoid NullPointerException
    try {
      const stillConnected = await device.isConnected();
      if (!stillConnected) {
        throw new Error('Device is no longer connected');
      }
    } catch (checkError: any) {
      throw new Error('Device is no longer connected');
    }

    try {
      // Convert command to byte array
      const data = [
        Math.min(100, Math.max(0, command.strength)),
        Math.min(10, Math.max(1, command.numBuzzes)),
        Math.min(100, Math.max(10, command.dutyOfBuzz)),
        Math.min(100, Math.max(10, command.durationOfDelay)),
      ];

      // Encode to base64
      const base64Data = bytesToBase64(data);

      // Write to vibration characteristic using captured reference
      await device.writeCharacteristicWithResponseForService(
        MAIN_SERVICE_UUID,
        VIBRATION_CHAR_UUID,
        base64Data
      );
    } catch (error: any) {
      console.error('Vibration error:', error);
      throw new Error(error.message || 'Failed to send vibration command');
    }
  },

  /**
   * Read firmware version from the band (with timeout to prevent hanging)
   * Firmware data is embedded in the same characteristic as battery status
   * Returns version string like "1.2345" or null if unavailable
   */
  readFirmwareVersion: async (): Promise<string | null> => {
    if (!connectedDevice) return null;

    // Verify the native connection is still alive to avoid NullPointerException
    try {
      const stillConnected = await connectedDevice.isConnected();
      if (!stillConnected) {
        console.log('[BLE] readFirmwareVersion: device no longer connected');
        return null;
      }
    } catch {
      return null;
    }

    try {
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          console.log('[BLE] readFirmwareVersion timed out after 5s');
          resolve(null);
        }, 5000);
      });

      const characteristic = await Promise.race([
        connectedDevice.readCharacteristicForService(
          MAIN_SERVICE_UUID,
          FIRMWARE_VERSION_CHAR_UUID
        ),
        timeoutPromise,
      ]);

      clearTimeout(timeoutId!);

      if (characteristic?.value) {
        const bytes = base64ToBytes(characteristic.value);
        if (bytes.length >= 6) {
          // Parse firmware version as dotted 4-part: data[2].data[3].data[4].data[5]
          const version = `${bytes[2]}.${bytes[3]}.${bytes[4]}.${bytes[5]}`;
          console.log('[BLE] Firmware version read:', version);
          return version;
        } else if (bytes.length > 0) {
          // Fallback: try to parse as string (chunk to avoid stack overflow)
          let versionStr = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            versionStr += String.fromCharCode(
              ...bytes.slice(i, Math.min(i + chunkSize, bytes.length))
            );
          }
          versionStr = versionStr.trim();
          console.log('[BLE] Firmware version (string):', versionStr);
          return versionStr;
        }
      }
      return null;
    } catch (error) {
      console.error('[BLE] Error reading firmware version:', error);
      return null;
    }
  },

  /**
   * Rename the band by writing to the display name characteristic
   * @param name The new name for the band (max 20 characters recommended)
   */
  renameBand: async (name: string): Promise<void> => {
    console.log('[BLE] renameBand called with name:', name);
    
    if (!connectedDevice) {
      console.log('[BLE] renameBand FAILED: No device connected');
      throw new Error('No device connected');
    }

    console.log('[BLE] Connected device:', connectedDevice.id, connectedDevice.name);

    try {
      // Convert string to UTF-8 bytes
      console.log('[BLE] Converting name to UTF-8 bytes...');
      const encoder = new TextEncoder();
      const nameBytes = Array.from(encoder.encode(name));
      console.log('[BLE] Name bytes:', nameBytes, 'length:', nameBytes.length);

      // Encode to base64
      console.log('[BLE] Encoding to base64...');
      const base64Data = bytesToBase64(nameBytes);
      console.log('[BLE] Base64 data:', base64Data);

      // Write to display name characteristic
      console.log('[BLE] Writing to DISPLAY_NAME_CHAR_UUID...');
      console.log('[BLE] Service UUID:', MAIN_SERVICE_UUID);
      console.log('[BLE] Characteristic UUID:', DISPLAY_NAME_CHAR_UUID);
      
      const writeStartTime = Date.now();
      await connectedDevice.writeCharacteristicWithResponseForService(
        MAIN_SERVICE_UUID,
        DISPLAY_NAME_CHAR_UUID,
        base64Data
      );
      const writeDuration = Date.now() - writeStartTime;
      
      console.log('[BLE] Write to characteristic COMPLETE', { duration: `${writeDuration}ms` });
      console.log('[BLE] Band renamed to:', name);

      // Update stored device name
      console.log('[BLE] Updating stored device name...');
      const storedDevice = await BLEManager.getLastDevice();
      if (storedDevice) {
        console.log('[BLE] Found stored device, updating name from', storedDevice.name, 'to', name);
        storedDevice.name = name;
        await AsyncStorage.setItem(
          STORAGE_KEY_LAST_DEVICE,
          JSON.stringify(storedDevice)
        );
        console.log('[BLE] Stored device name updated successfully');
      } else {
        console.log('[BLE] No stored device found, skipping update');
      }
      
      console.log('[BLE] renameBand COMPLETE');
    } catch (error: any) {
      console.error('[BLE] renameBand FAILED with error:', error);
      console.error('[BLE] Error details:', {
        message: error.message,
        code: error.code,
        errorCode: error.errorCode,
        reason: error.reason,
        stack: error.stack,
      });
      throw new Error(error.message || 'Failed to rename band');
    }
  },

  /**
   * Store last connected device for auto-reconnect
   */
  storeLastDevice: async (device: BLEDevice): Promise<void> => {
    try {
      const storedDevice: StoredDevice = {
        id: device.id,
        name: device.name || 'Safewave Band',
        lastConnectedDate: new Date().toISOString(),
      };
      await AsyncStorage.setItem(
        STORAGE_KEY_LAST_DEVICE,
        JSON.stringify(storedDevice)
      );
    } catch (error) {
      console.error('Error storing device:', error);
    }
  },

  /**
   * Get last connected device info
   */
  getLastDevice: async (): Promise<StoredDevice | null> => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY_LAST_DEVICE);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error reading last device:', error);
      return null;
    }
  },

  /**
   * Clear stored device info
   */
  clearLastDevice: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY_LAST_DEVICE);
    } catch (error) {
      console.error('Error clearing device:', error);
    }
  },

  /**
   * Monitor device disconnection
   */
  onDeviceDisconnected: (callback: (device: BLEDevice) => void): (() => void) => {
    const manager = getBleManager();

    if (!connectedDevice) {
      return () => { };
    }

    const deviceId = connectedDevice.id;
    // Capture device info before disconnect in case the native object becomes invalid
    const cachedDevice = mapDevice(connectedDevice);
    // Capture generation at subscription time to detect stale callbacks
    const gen = connectionGeneration;

    const subscription = manager.onDeviceDisconnected(
      deviceId,
      (error, device) => {
        try {
          if (error) {
            console.log('[BLE] Disconnect reason:', error.message, '| code:', error.errorCode, '| reason:', error.reason);
          }

          // If a new connection was established since this monitor was created,
          // this is a stale callback — ignore it to avoid clearing the new connection.
          if (connectionGeneration !== gen) {
            console.log('[BLE] Ignoring stale disconnect callback (gen', gen, 'vs current', connectionGeneration + ')');
            return;
          }

          // CRITICAL: Remove BLE subscriptions IMMEDIATELY before anything else.
          // react-native-ble-plx has a bug where monitorCharacteristic's onError
          // calls PromiseImpl.reject with a null code, causing a native crash.
          // By removing subscriptions here, we prevent the library from propagating
          // the disconnect error through the monitor callbacks.
          if (batterySubscription) {
            try { batterySubscription.remove(); } catch (_) {}
            batterySubscription = null;
          }
          if (notificationSubscription) {
            try { notificationSubscription.remove(); } catch (_) {}
            notificationSubscription = null;
          }

          connectedDevice = null;
          callback(device ? mapDevice(device) : cachedDevice);
        } catch (callbackError) {
          console.error('[BLE] Disconnect callback error:', callbackError);
          if (connectionGeneration === gen) {
            connectedDevice = null;
          }
        }
      }
    );

    return () => subscription.remove();
  },

  /**
   * Register a callback for iOS CoreBluetooth state restoration.
   * When iOS relaunches the app to restore a BLE session, this callback
   * receives the device ID so the store can reconnect.
   */
  /**
   * Register a callback for when a subscription error suggests disconnect.
   * Acts as a backup when onDeviceDisconnected doesn't fire.
   */
  onSubscriptionError: (callback: (() => void) | null): void => {
    subscriptionErrorCallback = callback;
  },

  onDeviceRestored: (callback: (deviceId: string) => void): void => {
    restoredDeviceCallback = callback;
  },

  /**
   * Destroy the BLE manager (cleanup)
   */
  destroy: (): void => {
    restoredDeviceCallback = null;
    if (batterySubscription) {
      batterySubscription.remove();
      batterySubscription = null;
    }

    if (notificationSubscription) {
      notificationSubscription.remove();
      notificationSubscription = null;
    }

    if (scanTimeoutId) {
      clearTimeout(scanTimeoutId);
      scanTimeoutId = null;
    }

    if (bleManagerInstance) {
      bleManagerInstance.destroy();
      bleManagerInstance = null;
    }

    connectedDevice = null;
    isScanActive = false;
  },
};
