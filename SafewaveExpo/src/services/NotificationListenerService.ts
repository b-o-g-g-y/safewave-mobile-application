import { NativeEventEmitter, NativeModules, Platform, Linking } from 'react-native';
import { useBluetoothStore } from '../store/bluetoothStore';
import { FirestoreService } from './firebase/FirestoreService';
import { ApplicationDocument } from '../types/user';
import { VibrationCommand, resolveLiveNumBuzzes } from '../types/bluetooth';

/**
 * Android Notification Listener Service
 * Intercepts notifications on Android and triggers vibrations on the connected band
 */

interface NotificationEvent {
  packageName: string;
  title: string;
  text: string;
  bigText: string;
  timestamp: number;
}

// Helper to open Android notification listener settings
const openNotificationListenerSettings = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    // Try to open notification listener settings directly
    await Linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS');
    console.log('[NotificationListener] Opened notification listener settings directly');
  } catch (error) {
    console.log('[NotificationListener] sendIntent not available, trying openURL');
    try {
      // Fallback: try opening via URL scheme
      await Linking.openURL('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS');
    } catch (urlError) {
      console.log('[NotificationListener] Opening general app settings as fallback');
      // Last resort: open general app settings
      await Linking.openSettings();
    }
  }
};

class AndroidNotificationListenerService {
  private eventEmitter: NativeEventEmitter | null = null;
  private subscription: any = null;
  private appsCache = new Map<string, ApplicationDocument>();
  private userId: string | null = null;
  private unsubscribeFromApps: (() => void) | null = null;
  private isServiceConnected: boolean = true;
  private connectionCheckListeners: Set<(connected: boolean) => void> = new Set();
  // Deduplication: track recent notifications to prevent double-processing
  private recentNotifications = new Map<string, number>();
  private readonly DEDUP_WINDOW_MS = 2000; // 2 seconds

  /**
   * Initialize the notification listener service
   */
  initialize(userId: string): void {
    if (Platform.OS !== 'android') {
      console.log('[NotificationListener] Not on Android, skipping initialization');
      return;
    }

    if (this.userId === userId && this.subscription) {
      console.log('[NotificationListener] Already initialized for this user');
      return;
    }

    // Clean up existing subscription
    this.cleanup();

    this.userId = userId;
    this.isServiceConnected = true; // Optimistic default: assume access is granted until proven otherwise
    console.log('[NotificationListener] Initializing for user:', userId);

    // Subscribe to apps for quick lookup
    this.unsubscribeFromApps = FirestoreService.subscribeToApps(userId, (apps) => {
      console.log('[NotificationListener] Fetched apps from Firebase:', apps.length, 'total apps');
      
      // Log all apps with their details
      apps.forEach((app, index) => {
        console.log(`[NotificationListener] App ${index + 1}:`, {
          name: app.name,
          bundleId: app.bundleIdentifier,
          platform: app.appPlatform,
          enabled: app.enabled,
          vibrations: app.config?.numberOfVibrations,
          strength: app.config?.strength,
        });
      });

      this.appsCache.clear();
      let androidCount = 0;
      apps.forEach((app) => {
        // Only cache Android apps
        if (app.appPlatform === 'android') {
          this.appsCache.set(app.bundleIdentifier.toLowerCase(), app);
          androidCount++;
          console.log('[NotificationListener] Cached Android app:', app.name, '(' + app.bundleIdentifier + ')');
        } else {
          console.log('[NotificationListener] Skipped non-Android app:', app.name, '(platform:', app.appPlatform + ')');
        }
      });
      
      console.log('[NotificationListener] Apps cache updated:', androidCount, 'Android apps cached');
      
      // Log the cache contents
      if (androidCount > 0) {
        console.log('[NotificationListener] Cached bundle IDs:', Array.from(this.appsCache.keys()));
      }
    });

    // Set up native event listener
    this.setupEventListener();
  }

  /**
   * Set up the native event listener for notifications
   */
  private setupEventListener(): void {
    try {
      // Create event emitter (works even without a specific native module)
      this.eventEmitter = new NativeEventEmitter();

      // Listen for notification events from native Android code
      this.subscription = this.eventEmitter.addListener(
        'onNotificationPosted',
        this.handleNotification.bind(this)
      );

      console.log('[NotificationListener] Event listener set up successfully');
    } catch (error) {
      console.error('[NotificationListener] Error setting up event listener:', error);
      this.isServiceConnected = false;
      this.notifyConnectionStatus(false);
    }
  }

  /**
   * Notify all listeners about connection status change
   */
  private notifyConnectionStatus(connected: boolean): void {
    this.isServiceConnected = connected;
    this.connectionCheckListeners.forEach(listener => listener(connected));
  }

  /**
   * Handle incoming notification from Android
   */
  private async handleNotification(event: NotificationEvent): Promise<void> {
    // Mark service as connected when we receive first notification
    if (!this.isServiceConnected) {
      console.log('[NotificationListener] Service is connected and working!');
      this.isServiceConnected = true;
      this.notifyConnectionStatus(true);
    }

    if (!this.userId) {
      console.warn('[NotificationListener] No user ID set, ignoring notification');
      return;
    }

    const { packageName, title = '', text = '', bigText = '', timestamp } = event;
    const trimmedPackageName = packageName.trim();

    if (!trimmedPackageName) {
      console.warn('[NotificationListener] Empty package name received');
      return;
    }

    console.log('[NotificationListener] Notification received:', trimmedPackageName);

    // Deduplication: check if we recently processed this notification.
    // Key on content (not just package) so distinct notifications from the same
    // app within the window aren't swallowed, while exact re-posts still are.
    const now = Date.now();
    const dedupKey = `${trimmedPackageName}|${title.trim()}|${text.trim()}`;
    const lastProcessed = this.recentNotifications.get(dedupKey);

    if (lastProcessed && (now - lastProcessed) < this.DEDUP_WINDOW_MS) {
      console.log('[NotificationListener] Duplicate notification ignored (within dedup window):', trimmedPackageName);
      return;
    }

    // Update the last processed timestamp
    this.recentNotifications.set(dedupKey, now);

    // Clean up old entries from the deduplication map (older than 5 seconds)
    for (const [key, time] of this.recentNotifications.entries()) {
      if (now - time > 5000) {
        this.recentNotifications.delete(key);
      }
    }

    try {
      // Look up the app in cache
      const app = this.appsCache.get(trimmedPackageName.toLowerCase());

      if (!app) {
        console.log('[NotificationListener] App not in user\'s monitored list:', trimmedPackageName);
        return;
      }

      if (!app.enabled) {
        console.log('[NotificationListener] App is disabled:', trimmedPackageName);
        return;
      }

      console.log('[NotificationListener] Processing notification for:', app.name);

      const notificationTitle = title.trim();
      // Prefer the expanded body text when present; it carries the fuller message.
      const notificationBody = (bigText.trim() || text.trim());

      // Decide whether this notification's content passes the phrase filter.
      const shouldBuzz = this.matchesPhrases(app, title, text, bigText);

      if (!shouldBuzz) {
        // Notification is suppressed by the user's phrase rules. Record it (so
        // history stays a complete log) but never vibrate.
        console.log('[NotificationListener] Notification filtered out by phrase rules:', app.name);
        await this.saveToHistory(app, trimmedPackageName, true, notificationTitle, notificationBody);
        return;
      }

      // Create vibration command from app config.
      // This path is Android-only (notifications are intercepted in-app), and
      // the Android firmware does not understand numBuzzes=0 as continuous, so
      // map continuous mode to a large finite count.
      const vibrationCommand: VibrationCommand = {
        strength: app.config.strength,
        numBuzzes: resolveLiveNumBuzzes(app.config.numberOfVibrations, 'android'),
        dutyOfBuzz: 50, // Default duty cycle
        durationOfDelay: 50, // Default delay between buzzes
      };

      // Always attempt the buzz. The store's vibrate() is self-healing: if the
      // BLE link dropped (e.g. in Doze), it reconnects and retries within a
      // bounded window, then gives up quietly. We don't gate on connectionState
      // here — doing so was the bug where a Doze-dropped link silently skipped
      // the buzz even though the notification was received.
      console.log('[NotificationListener] Sending vibration:', vibrationCommand);
      try {
        await useBluetoothStore.getState().vibrate(vibrationCommand);
      } catch (vibrateError) {
        console.log('[NotificationListener] Vibration failed (logging anyway):', vibrateError);
      }

      // Save to history regardless of whether the buzz landed.
      await this.saveToHistory(app, trimmedPackageName, false, notificationTitle, notificationBody);

      console.log('[NotificationListener] Notification processed successfully');
    } catch (error) {
      console.error('[NotificationListener] Error processing notification:', error);
    }
  }

  /**
   * Decide whether a notification's content passes the app's phrase filter.
   * Returns true (vibrate) when no phrases are configured, preserving the
   * original "vibrate for every notification" behavior.
   */
  private matchesPhrases(
    app: ApplicationDocument,
    title: string,
    text: string,
    bigText: string
  ): boolean {
    const phrases = app.config.phrases;
    if (!phrases || phrases.length === 0) {
      return true;
    }

    const haystack = `${title} ${text} ${bigText}`.toLowerCase();
    const matched = phrases.some((phrase) => {
      const needle = phrase.trim().toLowerCase();
      return needle.length > 0 && haystack.includes(needle);
    });

    const mode = app.config.phraseMode ?? 'allow';
    return mode === 'block' ? !matched : matched;
  }

  /**
   * Save notification to history.
   * `filtered` marks records that were suppressed by phrase rules (no vibration).
   */
  private async saveToHistory(
    app: ApplicationDocument,
    packageName: string,
    filtered: boolean,
    title?: string,
    body?: string
  ): Promise<void> {
    if (!this.userId) return;

    try {
      await FirestoreService.createHistory({
        appName: app.name,
        bundleIdentifier: packageName,
        userId: this.userId,
        message: title && title.length > 0 ? title : `Notification from ${app.name}`,
        // Store the raw title/body when captured so History can show details.
        // Only write keys when non-empty (Firestore rejects undefined).
        ...(title && title.length > 0 ? { title } : {}),
        ...(body && body.length > 0 ? { body } : {}),
        // Only write the flag when true so existing/non-filtered records stay clean.
        ...(filtered ? { filtered: true } : {}),
      });
      console.log('[NotificationListener] History record created', filtered ? '(filtered)' : '');
    } catch (error) {
      console.error('[NotificationListener] Error saving to history:', error);
    }
  }

  /**
   * Add a listener for connection status changes
   */
  addConnectionStatusListener(listener: (connected: boolean) => void): () => void {
    this.connectionCheckListeners.add(listener);
    // Immediately notify with current status
    listener(this.isServiceConnected);
    // Return unsubscribe function
    return () => {
      this.connectionCheckListeners.delete(listener);
    };
  }

  /**
   * Check if notification listener permission is granted
   * Returns the current connection status
   */
  checkPermission(): boolean {
    if (Platform.OS !== 'android') {
      return true;
    }

    // Return current connection status
    // If service is connected, permission is granted
    return this.isServiceConnected;
  }

  /**
   * Get current connection status
   */
  isConnected(): boolean {
    return this.isServiceConnected;
  }

  /**
   * Request notification listener permission
   * On Android, this must be done manually by the user in Settings
   */
  async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    console.log('[NotificationListener] User must enable notification access in Settings');
    return false; // Return false to indicate manual action needed
  }

  /**
   * Open Android notification listener settings directly
   */
  openSettings(): void {
    if (Platform.OS !== 'android') {
      return;
    }

    openNotificationListenerSettings().catch((error) => {
      console.error('[NotificationListener] Error opening settings:', error);
    });
  }

  /**
   * Clean up the service
   */
  cleanup(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }

    if (this.unsubscribeFromApps) {
      this.unsubscribeFromApps();
      this.unsubscribeFromApps = null;
    }

    this.appsCache.clear();
    this.recentNotifications.clear();
    this.userId = null;
    this.eventEmitter = null;
    this.isServiceConnected = false;
    this.connectionCheckListeners.clear();

    console.log('[NotificationListener] Cleaned up');
  }
}

// Export singleton instance
export const NotificationListenerService = new AndroidNotificationListenerService();
