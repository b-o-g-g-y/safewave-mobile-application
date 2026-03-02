import { FirestoreService } from './firebase/FirestoreService';
import { ApplicationDocument } from '../types/user';

/**
 * Service to handle notifications received from the Safewave Band
 */
export const NotificationService = {
  // Cache of apps for quick lookup
  _appsCache: new Map<string, ApplicationDocument>(),
  _userId: null as string | null,
  _unsubscribe: null as (() => void) | null,

  /**
   * Initialize the notification service with user ID
   * Sets up a subscription to the user's apps for quick lookup
   */
  initialize: (userId: string): void => {
    if (NotificationService._userId === userId && NotificationService._unsubscribe) {
      return; // Already initialized for this user
    }

    // Clean up existing subscription
    NotificationService.cleanup();

    NotificationService._userId = userId;
    NotificationService._appsCache.clear();

    // Subscribe to apps for quick lookup
    NotificationService._unsubscribe = FirestoreService.subscribeToApps(userId, (apps) => {
      NotificationService._appsCache.clear();
      let iosCount = 0;
      apps.forEach((app) => {
        // Only cache iOS apps
        if (app.appPlatform === 'ios') {
          NotificationService._appsCache.set(app.bundleIdentifier.toLowerCase(), app);
          iosCount++;
        }
      });
      console.log('[NotificationService] Apps cache updated:', iosCount, 'iOS apps');
    });

    console.log('[NotificationService] Initialized for user:', userId);
  },

  /**
   * Clean up the notification service
   */
  cleanup: (): void => {
    if (NotificationService._unsubscribe) {
      NotificationService._unsubscribe();
      NotificationService._unsubscribe = null;
    }
    NotificationService._appsCache.clear();
    NotificationService._userId = null;
    console.log('[NotificationService] Cleaned up');
  },

  /**
   * Process a notification received from the band
   * Only saves to history if the bundle ID is in the user's monitored (enabled) apps
   * @param bundleIdentifier The bundle ID of the app that triggered the notification
   */
  processNotification: async (bundleIdentifier: string): Promise<void> => {
    if (!NotificationService._userId) {
      console.warn('[NotificationService] Cannot process notification - no user ID set');
      return;
    }

    const trimmedBundleId = bundleIdentifier.trim();
    if (!trimmedBundleId) {
      console.warn('[NotificationService] Empty bundle identifier received');
      return;
    }

    console.log('[NotificationService] Processing notification for:', trimmedBundleId);

    try {
      // Look up the app in our cache
      const app = NotificationService._appsCache.get(trimmedBundleId.toLowerCase());

      // Only save notifications for monitored (enabled) apps
      if (!app) {
        console.log('[NotificationService] App not in user\'s monitored list, skipping:', trimmedBundleId);
        return;
      }

      if (!app.enabled) {
        console.log('[NotificationService] App is disabled, skipping:', trimmedBundleId);
        return;
      }

      // Create history record
      await FirestoreService.createHistory({
        appName: app.name,
        bundleIdentifier: trimmedBundleId,
        userId: NotificationService._userId,
        message: `Notification from ${app.name}`,
      });

      console.log('[NotificationService] History record created for:', app.name);
    } catch (error) {
      console.error('[NotificationService] Error processing notification:', error);
    }
  },
};
