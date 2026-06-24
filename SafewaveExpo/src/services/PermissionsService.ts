import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

/**
 * PermissionsService
 *
 * Central place for the OS-level grants that keep the BLE foreground service
 * alive in the background on Android:
 *   - POST_NOTIFICATIONS (Android 13+) so the ongoing FGS notification shows
 *   - battery-optimization exemption so OEMs don't kill the service
 *   - notification-listener access so notifications from other apps are seen
 *   - OEM auto-start / protected-app deep-link for strict manufacturers
 *
 * The native checks/intents live on the BLEForegroundService native module
 * (see plugins/withBLEForegroundService.js). On iOS everything resolves to a
 * granted/no-op state since the platform handles background BLE differently.
 */

interface BLEForegroundServiceNativeModule {
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
  isNotificationListenerEnabled(): Promise<boolean>;
  openNotificationListenerSettings(): Promise<boolean>;
  getManufacturer(): Promise<string>;
  openAutoStartSettings(): Promise<boolean>;
}

const Native: BLEForegroundServiceNativeModule | undefined =
  Platform.OS === 'android' ? NativeModules.BLEForegroundService : undefined;

const isAndroid = Platform.OS === 'android';
// Platform.Version is a number on Android (API level) and a string on iOS.
const androidApiLevel = isAndroid ? Number(Platform.Version) : 0;

// Manufacturers known to aggressively kill background services. These are the
// ones where the OEM auto-start / protected-app step is worth surfacing.
const STRICT_OEMS = ['xiaomi', 'redmi', 'poco', 'huawei', 'honor', 'oppo', 'realme', 'oneplus', 'vivo', 'iqoo', 'samsung', 'letv', 'meizu'];

export type PermissionKey =
  | 'notifications'
  | 'batteryOptimization'
  | 'notificationListener'
  | 'autoStart';

export interface PermissionStatus {
  /** POST_NOTIFICATIONS granted (always true below Android 13 / on iOS). */
  notifications: boolean;
  /** App is on the battery-optimization allowlist. */
  batteryOptimization: boolean;
  /** Notification-listener access granted. */
  notificationListener: boolean;
  /** Device is a strict OEM where the auto-start step should be shown. */
  isStrictOEM: boolean;
}

export const PermissionsService = {
  /**
   * Request POST_NOTIFICATIONS at runtime (Android 13+). Returns true when
   * granted or not applicable (older Android / iOS).
   */
  async ensureNotifications(): Promise<boolean> {
    if (!isAndroid || androidApiLevel < 33) {
      return true;
    }
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.error('[Permissions] ensureNotifications failed:', error);
      return false;
    }
  },

  async hasNotifications(): Promise<boolean> {
    if (!isAndroid || androidApiLevel < 33) {
      return true;
    }
    try {
      return await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
    } catch (error) {
      console.error('[Permissions] hasNotifications failed:', error);
      return false;
    }
  },

  // ---- Battery optimization ----

  async isIgnoringBatteryOptimizations(): Promise<boolean> {
    if (!Native) return true;
    try {
      return await Native.isIgnoringBatteryOptimizations();
    } catch (error) {
      console.error('[Permissions] isIgnoringBatteryOptimizations failed:', error);
      return false;
    }
  },

  async requestIgnoreBatteryOptimizations(): Promise<boolean> {
    if (!Native) return true;
    try {
      return await Native.requestIgnoreBatteryOptimizations();
    } catch (error) {
      console.error('[Permissions] requestIgnoreBatteryOptimizations failed:', error);
      return false;
    }
  },

  // ---- Notification listener ----

  async isNotificationListenerEnabled(): Promise<boolean> {
    if (!Native) return true;
    try {
      return await Native.isNotificationListenerEnabled();
    } catch (error) {
      console.error('[Permissions] isNotificationListenerEnabled failed:', error);
      return false;
    }
  },

  async openNotificationListenerSettings(): Promise<void> {
    if (!Native) return;
    try {
      await Native.openNotificationListenerSettings();
    } catch (error) {
      console.error('[Permissions] openNotificationListenerSettings failed:', error);
    }
  },

  // ---- OEM auto-start ----

  async getManufacturer(): Promise<string> {
    if (!Native) return '';
    try {
      return await Native.getManufacturer();
    } catch (error) {
      console.error('[Permissions] getManufacturer failed:', error);
      return '';
    }
  },

  async isStrictOEM(): Promise<boolean> {
    if (!isAndroid) return false;
    const manufacturer = await this.getManufacturer();
    return STRICT_OEMS.some((oem) => manufacturer.includes(oem));
  },

  async openAutoStartSettings(): Promise<void> {
    if (!Native) return;
    try {
      await Native.openAutoStartSettings();
    } catch (error) {
      console.error('[Permissions] openAutoStartSettings failed:', error);
    }
  },

  /**
   * Snapshot of every grant the checklist UI cares about. iOS resolves to a
   * fully-granted, non-strict state so the checklist simply shows nothing to do.
   */
  async getStatus(): Promise<PermissionStatus> {
    if (!isAndroid) {
      return {
        notifications: true,
        batteryOptimization: true,
        notificationListener: true,
        isStrictOEM: false,
      };
    }
    const [notifications, batteryOptimization, notificationListener, isStrictOEM] =
      await Promise.all([
        this.hasNotifications(),
        this.isIgnoringBatteryOptimizations(),
        this.isNotificationListenerEnabled(),
        this.isStrictOEM(),
      ]);
    return { notifications, batteryOptimization, notificationListener, isStrictOEM };
  },
};
