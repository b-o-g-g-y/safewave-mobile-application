/**
 * Bluetooth Low Energy Constants for Safewave Band
 * 
 * UUIDs and protocol constants from PRD Section 12
 */

// ==================== SERVICE UUIDs ====================

/**
 * Main Safewave Band service
 */
export const MAIN_SERVICE_UUID = '0000fffe-0000-1000-8000-00805f9b34fb';

/**
 * Human Interface Device service for pairing
 */
export const HID_SERVICE_UUID = '00001812-0000-1000-8000-00805f9b34fb';

/**
 * Standard battery service
 */
export const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';

/**
 * Device information service
 */
export const DEVICE_INFO_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';

// ==================== CHARACTERISTIC UUIDs ====================

/**
 * App Settings characteristic
 * Properties: Read, Write, WriteNoResponse, Notify
 * Format: String "bundleId, strength, numBuzzes, dutyOfBuzz, durationOfDelay;"
 */
export const APP_SETTINGS_CHAR_UUID = '81b2497c-8230-11ed-a1eb-0242ac120002';

/**
 * Test/Vibration characteristic
 * Properties: Write, WriteNoResponse
 * Format: [strength, numBuzzes, dutyOfBuzz, durationOfDelay] (4 bytes)
 */
export const VIBRATION_CHAR_UUID = '12d9cf1a-751b-11ed-a1eb-0242ac120002';

/**
 * Battery Status characteristic
 * Properties: Read, Notify
 * Format: [batteryLevel, isCharging] (2 bytes)
 */
export const BATTERY_CHAR_UUID = '47cd799a-8233-11ed-a1eb-0242ac120002';

/**
 * Display Name characteristic
 * Properties: Read, Write, WriteNoResponse
 * Format: UTF-8 encoded hex string
 */
export const DISPLAY_NAME_CHAR_UUID = '543eff2a-751b-11ed-a1eb-0242ac120002';

/**
 * Firmware Version characteristic (Standard BLE Device Info Service)
 * Properties: Read
 * Format: Byte array where version is parsed as data[2].data[3]data[4]data[5]
 */
export const FIRMWARE_VERSION_CHAR_UUID = '47cd799a-8233-11ed-a1eb-0242ac120002';

// ==================== OTA UPDATE SERVICE UUIDs ====================

/**
 * OTA firmware update service.
 * Per the vendor Android reference (`UUID_SERVICE_DATA_H`) the service
 * base is `fe00`, not `ff01` (OTA.md §10 is incorrect about this).
 */
export const OTA_SERVICE_UUID = '02f00000-0000-0000-0000-00000000fe00';

/**
 * OTA status/info characteristic (Read)
 */
export const OTA_CHAR_0_UUID = '02f00000-0000-0000-0000-00000000ff00';

/**
 * OTA firmware data chunks characteristic (Write, WriteNoResponse)
 */
export const OTA_CHAR_1_UUID = '02f00000-0000-0000-0000-00000000ff01';

/**
 * OTA transfer progress characteristic (Read, Notify)
 */
export const OTA_CHAR_2_UUID = '02f00000-0000-0000-0000-00000000ff02';

/**
 * OTA metadata characteristic (Read)
 */
export const OTA_CHAR_3_UUID = '02f00000-0000-0000-0000-00000000ff03';

// ==================== SCAN CONFIGURATION ====================

/**
 * Service UUIDs to scan for when discovering devices
 * We scan for HID service to find Safewave Bands
 */
export const SCAN_SERVICE_UUIDS = [HID_SERVICE_UUID];

/**
 * Scan timeout in milliseconds (15 seconds)
 */
export const SCAN_TIMEOUT_MS = 15000;

/**
 * Reconnection attempt interval in milliseconds
 */
export const RECONNECT_INTERVAL_MS = 5000;

/**
 * Maximum reconnection attempts
 */
export const MAX_RECONNECT_ATTEMPTS = 3;

// ==================== DEVICE IDENTIFICATION ====================

/**
 * Device name prefix to identify Safewave Bands
 */
export const DEVICE_NAME_PREFIX = 'Safewave';

/**
 * Alternative device name patterns
 */
export const DEVICE_NAME_PATTERNS = [
  /^Safewave/i,
  /^SW-/i,
  /^Band/i,
];

/**
 * Check if a device name matches Safewave Band patterns
 */
export const isValidDeviceName = (name: string | null | undefined): boolean => {
  if (!name) return false;
  return DEVICE_NAME_PATTERNS.some(pattern => pattern.test(name));
};

// ==================== VIBRATION DEFAULTS ====================

/**
 * Default vibration strength (0-100)
 */
export const DEFAULT_VIBRATION_STRENGTH = 50;

/**
 * Default number of buzzes (1-10)
 */
export const DEFAULT_NUM_BUZZES = 2;

/**
 * Default duty cycle (10-100)
 */
export const DEFAULT_DUTY_CYCLE = 50;

/**
 * Default delay between buzzes in ms (10-100)
 */
export const DEFAULT_BUZZ_DELAY = 50;

// ==================== ASYNC STORAGE KEYS ====================

/**
 * Key for storing last connected device info
 */
export const STORAGE_KEY_LAST_DEVICE = '@safewave_last_device';

/**
 * Key for storing auto-reconnect preference
 */
export const STORAGE_KEY_AUTO_RECONNECT = '@safewave_auto_reconnect';

// ==================== SPECIAL COMMANDS ====================

/**
 * Command to turn off the band and disconnect
 * Send [0xFF, 0xAA] to vibration characteristic
 */
export const SHUTOFF_BAND_COMMAND = [0xFF, 0xAA];
