import { Platform, Linking, Alert } from 'react-native';

/**
 * Utility functions for Android notification permissions
 */

/**
 * Open Android notification listener settings directly
 */
export const openNotificationSettings = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    console.log('[PermissionsHelper] Not on Android, skipping');
    return;
  }

  try {
    // Try to open notification listener settings directly using sendIntent
    await Linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS');
    console.log('[PermissionsHelper] Opened notification listener settings directly');
  } catch (error) {
    console.log('[PermissionsHelper] sendIntent not available, trying openURL');
    try {
      // Fallback: try opening via URL scheme
      await Linking.openURL('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS');
    } catch (urlError) {
      console.log('[PermissionsHelper] Opening general app settings as fallback');
      // Last resort: open general app settings
      try {
        await Linking.openSettings();
      } catch (settingsError) {
        console.error('[PermissionsHelper] Error opening settings:', settingsError);
        Alert.alert('Error', 'Failed to open settings. Please navigate to Settings > Apps > Safewave manually.');
      }
    }
  }
};

/**
 * Show alert prompting user to enable notification access
 */
export const promptNotificationAccess = (): void => {
  if (Platform.OS !== 'android') {
    return;
  }

  Alert.alert(
    'Enable Notification Access',
    'To receive alerts on your Safewave Band, you need to grant Notification Access permission.\n\nYou will be taken to the Notification Access settings where you can enable it for Safewave.',
    [
      { text: 'Later', style: 'cancel' },
      { 
        text: 'Open Settings', 
        onPress: openNotificationSettings 
      }
    ]
  );
};

/**
 * Show info about notification access requirement
 */
export const showNotificationAccessInfo = (): void => {
  Alert.alert(
    'Notification Access',
    'On Android, the Safewave app needs Notification Access permission to:\n\n• Detect notifications from selected apps\n• Send vibration alerts to your Safewave Band\n• Log notification history\n\nThis permission must be manually enabled in Android Settings.',
    [{ text: 'OK' }]
  );
};
