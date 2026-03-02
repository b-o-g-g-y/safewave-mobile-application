import { NativeEventEmitter, NativeModules, Platform, Linking } from 'react-native';
import { useBluetoothStore } from '../store/bluetoothStore';
import { FirestoreService } from './firebase/FirestoreService';
import { ApplicationDocument } from '../types/user';
import { VibrationCommand } from '../types/bluetooth';

/**
 * Android Notification Listener Service
 * Intercepts notifications on Android and triggers vibrations on the connected band
 */

interface NotificationEvent {
  packageName: string;
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

    const { packageName, timestamp } = event;
    const trimmedPackageName = packageName.trim();

    if (!trimmedPackageName) {
      console.warn('[NotificationListener] Empty package name received');
      return;
    }

    console.log('[NotificationListener] Notification received:', trimmedPackageName);

    // Deduplication: check if we recently processed this notification
    const now = Date.now();
    const lastProcessed = this.recentNotifications.get(trimmedPackageName);
    
    if (lastProcessed && (now - lastProcessed) < this.DEDUP_WINDOW_MS) {
      console.log('[NotificationListener] Duplicate notification ignored (within dedup window):', trimmedPackageName);
      return;
    }
    
    // Update the last processed timestamp
    this.recentNotifications.set(trimmedPackageName, now);
    
    // Clean up old entries from the deduplication map (older than 5 seconds)
    for (const [pkg, time] of this.recentNotifications.entries()) {
      if (now - time > 5000) {
        this.recentNotifications.delete(pkg);
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

      // Get the Bluetooth store
      const bluetoothStore = useBluetoothStore.getState();

      // Check if band is connected
      if (bluetoothStore.connectionState !== 'connected') {
        console.log('[NotificationListener] Band not connected, skipping vibration');
        // Still save to history
        await this.saveToHistory(app, trimmedPackageName);
        return;
      }

      // Create vibration command from app config
      const vibrationCommand: VibrationCommand = {
        strength: app.config.strength,
        numBuzzes: app.config.numberOfVibrations,
        dutyOfBuzz: 50, // Default duty cycle
        durationOfDelay: 50, // Default delay between buzzes
      };

      // Send vibration to band
      console.log('[NotificationListener] Sending vibration:', vibrationCommand);
      await bluetoothStore.vibrate(vibrationCommand);

      // Save to history
      await this.saveToHistory(app, trimmedPackageName);

      console.log('[NotificationListener] Notification processed successfully');
    } catch (error) {
      console.error('[NotificationListener] Error processing notification:', error);
    }
  }

  /**
   * Save notification to history
   */
  private async saveToHistory(app: ApplicationDocument, packageName: string): Promise<void> {
    if (!this.userId) return;

    try {
      await FirestoreService.createHistory({
        appName: app.name,
        bundleIdentifier: packageName,
        userId: this.userId,
        message: `Notification from ${app.name}`,
      });
      console.log('[NotificationListener] History record created');
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
