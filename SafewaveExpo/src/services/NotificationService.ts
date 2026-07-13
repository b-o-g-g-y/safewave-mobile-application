import { FirestoreService } from './firebase/FirestoreService';
import { ApplicationDocument } from '../types/user';

/**
 * How long after a notification a band button press still counts as an
 * acknowledgement of it. The band buzzes until acknowledged (numBuzzes=0), so
 * this bounds how late a user can react and still have the press attributed.
 */
const ACK_WINDOW_MS = 3 * 60 * 1000;

/**
 * Service to handle notifications received from the Safewave Band
 */
export const NotificationService = {
  // Cache of apps for quick lookup
  _appsCache: new Map<string, ApplicationDocument>(),
  _userId: null as string | null,
  _unsubscribe: null as (() => void) | null,

  // The band's button-ack carries no reference to what it acknowledges (the
  // payload is a bare 0x01), so the ack is attributed to the most recent
  // notification that actually buzzed the band, provided it is still within
  // ACK_WINDOW_MS. Presses outside the window are treated as unattributed
  // button presses rather than acknowledgements of a stale alert.
  _notificationSeq: 0,
  _lastNotification: null as {
    seq: number;
    raw: string;
    appName: string | null;
    historyId: string | null;
    at: number;
    acknowledged: boolean;
  } | null,

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

    const seq = ++NotificationService._notificationSeq;
    NotificationService._lastNotification = {
      seq,
      raw: trimmedBundleId,
      appName: null,
      historyId: null,
      at: Date.now(),
      acknowledged: false,
    };

    console.log(`[NotificationService] [seq ${seq}] Processing notification for:`, trimmedBundleId);

    try {
      // Look up the app in our cache
      const app = NotificationService._appsCache.get(trimmedBundleId.toLowerCase());

      // Only save notifications for monitored (enabled) apps
      if (!app) {
        console.log(`[NotificationService] [seq ${seq}] App not in user's monitored list, NO history written:`, trimmedBundleId);
        return;
      }

      if (!app.enabled) {
        console.log(`[NotificationService] [seq ${seq}] App is disabled, NO history written:`, trimmedBundleId);
        return;
      }

      // Create history record
      const historyId = await FirestoreService.createHistory({
        appName: app.name,
        bundleIdentifier: trimmedBundleId,
        userId: NotificationService._userId,
        message: `Notification from ${app.name}`,
      });

      // Only attach the id if this is still the most recent notification —
      // a newer one may have landed while the Firestore write was in flight.
      if (NotificationService._lastNotification?.seq === seq) {
        NotificationService._lastNotification.appName = app.name;
        NotificationService._lastNotification.historyId = historyId;
      }

      console.log(`[NotificationService] [seq ${seq}] History record CREATED for:`, app.name, historyId);
    } catch (error) {
      console.error(`[NotificationService] [seq ${seq}] Error processing notification:`, error);
    }
  },

  /**
   * Handle a button-ack from the band. Attributes the press to the most recent
   * notification if it buzzed the band within ACK_WINDOW_MS, and marks that
   * notification's history record as acknowledged.
   *
   * Returns true if the press was attributed to a notification.
   */
  handleButtonAck: async (): Promise<boolean> => {
    const last = NotificationService._lastNotification;

    if (!last || !last.historyId) {
      console.log('[NotificationService] Button ack with no recent buzzing notification — unattributed press');
      return false;
    }

    if (last.acknowledged) {
      console.log(`[NotificationService] [seq ${last.seq}] Already acknowledged, ignoring repeat press`);
      return false;
    }

    const elapsed = Date.now() - last.at;
    if (elapsed > ACK_WINDOW_MS) {
      console.log(
        `[NotificationService] Button ack ${elapsed}ms after [seq ${last.seq}] — outside ${ACK_WINDOW_MS}ms window, unattributed`
      );
      return false;
    }

    // Mark before awaiting so a double-press can't double-write.
    last.acknowledged = true;

    try {
      await FirestoreService.markHistoryAcknowledged(last.historyId);
      console.log(
        `[NotificationService] [seq ${last.seq}] ACKNOWLEDGED "${last.appName}" after ${elapsed}ms`
      );
      return true;
    } catch (error) {
      last.acknowledged = false; // allow a retry on the next press
      console.error('[NotificationService] Failed to mark history acknowledged:', error);
      return false;
    }
  },
};
