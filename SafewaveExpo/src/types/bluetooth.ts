/**
 * BLE Connection States
 */
export type ConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'reconnecting';

/**
 * Discovered BLE device
 */
export interface BLEDevice {
  id: string; // Device UUID/MAC address
  name: string | null;
  rssi: number | null; // Signal strength
  localName?: string | null;
  isConnectable?: boolean | null;
  serviceUUIDs?: string[] | null;
}

/**
 * Battery status from the Safewave Band
 */
export interface BatteryStatus {
  level: number; // 0-100 percentage
  isCharging: boolean;
}

/**
 * Vibration command parameters
 */
export interface VibrationCommand {
  strength: number; // 0-100 (vibration intensity percentage)
  numBuzzes: number; // 1-10 (number of vibration pulses)
  dutyOfBuzz: number; // 10-100 (duty cycle, default: 50)
  durationOfDelay: number; // 10-100 (delay between buzzes in ms, default: 50)
}

/**
 * Connected device info stored for auto-reconnect
 */
export interface StoredDevice {
  id: string;
  name: string;
  lastConnectedDate: string; // ISO 8601 timestamp
}

/**
 * Assigned band info for filtering during scan
 */
export interface AssignedBand {
  id: string;
  name: string;
  organizationId: string;
}

/**
 * BLE Manager state
 */
export interface BluetoothState {
  // Connection
  connectionState: ConnectionState;
  connectedDevice: BLEDevice | null;
  reconnectingDeviceName: string | null;

  // Scanning
  discoveredDevices: BLEDevice[];
  isScanning: boolean;

  // Band assignment (for filtering)
  assignedBands: AssignedBand[];

  // Battery
  batteryLevel: number | null;
  isCharging: boolean;

  // Firmware
  firmwareVersion: string | null;

  // Error handling
  error: string | null;

  // Permissions
  hasPermissions: boolean;
  bluetoothEnabled: boolean;
}

/**
 * Bluetooth store actions
 */
export interface BluetoothActions {
  // Initialization
  initialize: () => Promise<void>;
  autoConnect: () => Promise<void>;

  // Band assignment
  fetchAssignedBands: () => Promise<void>;

  // Scanning (filters by assigned bands)
  startScan: () => Promise<void>;
  startScanUnfiltered: () => Promise<void>; // For admin band registration
  stopScan: () => void;
  clearDiscoveredDevices: () => void;

  // Connection
  connect: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  startBandHeartbeat: () => void;
  stopBandHeartbeat: () => void;
  handleAppClosed: () => Promise<void>;
  startAutoReconnect: (deviceId?: string, deviceName?: string) => void;
  stopAutoReconnect: () => void;

  // Band operations
  vibrate: (command: VibrationCommand) => Promise<void>;
  testVibration: () => Promise<void>;
  readFirmwareVersion: () => Promise<string | null>;
  renameBand: (name: string) => Promise<void>;
  writeAppSettings: (apps: Array<{
    bundleIdentifier: string;
    config: { strength: number; numberOfVibrations: number };
  }>) => Promise<void>;

  // State management
  setError: (error: string | null) => void;
  clearError: () => void;
  reset: () => void;
}

/**
 * Complete Bluetooth store type
 */
export type BluetoothStore = BluetoothState & BluetoothActions;

/**
 * Default vibration command for testing/confirmation
 */
export const DEFAULT_VIBRATION: VibrationCommand = {
  strength: 50,
  numBuzzes: 2,
  dutyOfBuzz: 50,
  durationOfDelay: 50,
};

/**
 * Special command to turn off the band
 */
export const SHUTOFF_COMMAND = [0xFF, 0xAA];
