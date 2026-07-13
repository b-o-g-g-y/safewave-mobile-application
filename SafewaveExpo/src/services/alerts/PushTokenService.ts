import { Platform } from 'react-native';
import {
  getMessaging,
  getToken,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  requestPermission,
} from '@react-native-firebase/messaging';

import { FirestoreService } from '../firebase/FirestoreService';
import { getDeviceId } from './deviceId';

/**
 * Registers this install's FCM token under users/{uid}/devices/{deviceId} so
 * the backend can push alerts to it. A token the backend can't see is an alert
 * that silently never arrives, so this runs on every login and re-checks on
 * every foreground.
 */
export const PushTokenService = {
  _userId: null as string | null,
  _unsubscribeTokenRefresh: null as (() => void) | null,

  /**
   * Call once the user is authenticated — the device doc lives under their uid.
   */
  initialize: async (userId: string): Promise<void> => {
    if (PushTokenService._userId === userId && PushTokenService._unsubscribeTokenRefresh) {
      return; // Already registered for this user
    }

    PushTokenService.cleanup();
    PushTokenService._userId = userId;

    const messaging = getMessaging();

    try {
      if (Platform.OS === 'ios') {
        // iOS won't mint an FCM token until APNs has registered the device.
        // Awaiting this first avoids the "No APNS token specified" race.
        await registerDeviceForRemoteMessages(messaging);

        // Provisional authorization: no prompt shown to the user, but iOS still
        // treats the app as notification-authorized, which keeps background
        // delivery of data-only pushes from being throttled. We never post a
        // banner ourselves — the band is the alert surface — so the user sees
        // nothing from this.
        await requestPermission(messaging, { provisional: true });
      }

      const token = await getToken(messaging);
      await PushTokenService._persist(userId, token);
    } catch (error) {
      // Most likely cause on iOS is a missing APNs key in Firebase, or a
      // provisioning profile without the push capability. Log loudly: pushes
      // are dead until this is fixed, but it must not take the app down.
      console.error('[PushTokenService] Failed to register FCM token:', error);
    }

    // Tokens rotate. A stale token is an undelivered alert, so keep it fresh.
    PushTokenService._unsubscribeTokenRefresh = onTokenRefresh(messaging, (token) => {
      const currentUserId = PushTokenService._userId;
      if (!currentUserId) return;
      PushTokenService._persist(currentUserId, token).catch((error) => {
        console.error('[PushTokenService] Failed to persist refreshed token:', error);
      });
    });
  },

  /**
   * Re-check the token when the app comes back to the foreground. onTokenRefresh
   * only fires while we're running, so a rotation that happened while the app was
   * dead would otherwise leave Firestore holding a token that no longer works.
   */
  refresh: async (): Promise<void> => {
    const userId = PushTokenService._userId;
    if (!userId) return;

    try {
      const token = await getToken(getMessaging());
      await PushTokenService._persist(userId, token);
    } catch (error) {
      console.error('[PushTokenService] Foreground token refresh failed:', error);
    }
  },

  _persist: async (userId: string, token: string): Promise<void> => {
    const deviceId = await getDeviceId();
    await FirestoreService.upsertDevice(userId, deviceId, token);
    console.log(
      `[PushTokenService] Registered device ${deviceId} (${Platform.OS}) for user ${userId}`
    );
  },

  cleanup: (): void => {
    if (PushTokenService._unsubscribeTokenRefresh) {
      PushTokenService._unsubscribeTokenRefresh();
      PushTokenService._unsubscribeTokenRefresh = null;
    }
    PushTokenService._userId = null;
  },
};
