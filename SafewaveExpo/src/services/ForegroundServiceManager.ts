import { NativeModules, Platform } from 'react-native';

/**
 * ForegroundServiceManager
 *
 * Thin wrapper around the native BLEForegroundService module.
 * On Android, starts a foreground service with a persistent notification
 * to keep the app process alive while maintaining a BLE connection.
 * On iOS, this is a no-op (iOS uses bluetooth-central background mode instead).
 */

interface BLEForegroundServiceModule {
  startService(bandName: string): void;
  updateService(bandName: string, status: string): void;
  stopService(): void;
}

const NativeForegroundService: BLEForegroundServiceModule | undefined =
  Platform.OS === 'android' ? NativeModules.BLEForegroundService : undefined;

export const ForegroundServiceManager = {
  /**
   * Start the foreground service after a successful BLE connection.
   * Shows a persistent notification: "Connected to [bandName]"
   */
  startService(bandName: string): void {
    if (!NativeForegroundService) return;

    try {
      NativeForegroundService.startService(bandName);
      console.log('[ForegroundService] Started for:', bandName);
    } catch (error) {
      console.error('[ForegroundService] Failed to start:', error);
    }
  },

  /**
   * Update the notification text (e.g. when reconnecting).
   * @param bandName - Name of the band
   * @param status - "connected" | "reconnecting"
   */
  updateService(bandName: string, status: 'connected' | 'reconnecting'): void {
    if (!NativeForegroundService) return;

    try {
      NativeForegroundService.updateService(bandName, status);
      console.log('[ForegroundService] Updated:', status, bandName);
    } catch (error) {
      console.error('[ForegroundService] Failed to update:', error);
    }
  },

  /**
   * Stop the foreground service.
   * Called on manual disconnect, logout, or app reset.
   */
  stopService(): void {
    if (!NativeForegroundService) return;

    try {
      NativeForegroundService.stopService();
      console.log('[ForegroundService] Stopped');
    } catch (error) {
      console.error('[ForegroundService] Failed to stop:', error);
    }
  },
};
