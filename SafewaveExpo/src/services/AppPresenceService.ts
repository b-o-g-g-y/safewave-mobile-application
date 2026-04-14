import { AppState, AppStateStatus } from 'react-native';
import { FirestoreService } from './firebase/FirestoreService';

/**
 * Heartbeat interval in milliseconds (60 seconds)
 * Continues in background to track app presence in real-time
 */
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/**
 * AppPresenceService - Tracks app open/close state and sends heartbeats to Firebase
 *
 * This service enables admins to see which employees have the app open in real-time.
 * It works by sending periodic heartbeats to Firestore every 60 seconds, including
 * when the app is in the background (to maintain real-time tracking accuracy).
 * 
 * Heartbeats continue in background on both iOS and Android. If the app is killed
 * by the OS or user, heartbeats will stop and admins can query for users with stale
 * lastHeartbeat timestamps to identify closed apps.
 */
export const AppPresenceService = {
  _userId: null as string | null,
  _heartbeatInterval: null as ReturnType<typeof setInterval> | null,
  _appStateSubscription: null as ReturnType<typeof AppState.addEventListener> | null,
  _isInitialized: false,
  _currentAppState: AppState.currentState,
  _skipNextCleanupWrite: false,

  /**
   * Skip the next "mark app closed" write.
   * Useful during account deletion/logout transitions where the user doc
   * may already be gone before React effects finish cleaning up.
   */
  skipNextCleanupWrite: (): void => {
    AppPresenceService._skipNextCleanupWrite = true;
  },

  /**
   * Initialize presence tracking for a user
   * Should be called when user is authenticated
   */
  initialize: (userId: string): void => {
    if (AppPresenceService._isInitialized) {
      console.log('[AppPresenceService] Already initialized, cleaning up first');
      AppPresenceService.cleanup();
    }

    console.log('[AppPresenceService] Initializing for user:', userId);
    AppPresenceService._userId = userId;
    AppPresenceService._isInitialized = true;

    // Mark app as open immediately
    AppPresenceService._markAppOpen().catch((error) => {
      console.error('[AppPresenceService] Failed to mark app open on init:', error);
    });

    // Start heartbeat interval
    AppPresenceService._startHeartbeat();

    // Listen to app state changes
    AppPresenceService._appStateSubscription = AppState.addEventListener(
      'change',
      AppPresenceService._handleAppStateChange
    );
  },

  /**
   * Clean up presence tracking
   * Should be called on logout or when app is being terminated (not on background)
   */
  cleanup: (): void => {
    console.log('[AppPresenceService] Cleaning up');

    // Stop heartbeat
    AppPresenceService._stopHeartbeat();

    // Remove app state listener
    if (AppPresenceService._appStateSubscription) {
      AppPresenceService._appStateSubscription.remove();
      AppPresenceService._appStateSubscription = null;
    }

    // Mark app as closed (best effort - may not run if app is force-killed)
    if (AppPresenceService._userId && !AppPresenceService._skipNextCleanupWrite) {
      AppPresenceService._markAppClosed().catch((error) => {
        console.error('[AppPresenceService] Failed to mark app closed on cleanup:', error);
      });
    }

    AppPresenceService._userId = null;
    AppPresenceService._isInitialized = false;
    AppPresenceService._skipNextCleanupWrite = false;
  },

  /**
   * Handle app state changes (active, background, inactive)
   */
  _handleAppStateChange: (nextAppState: AppStateStatus): void => {
    const previousState = AppPresenceService._currentAppState;
    AppPresenceService._currentAppState = nextAppState;

    console.log('[AppPresenceService] App state changed:', previousState, '->', nextAppState);

    if (!AppPresenceService._userId) {
      return;
    }

    // App came to foreground
    if (
      (previousState === 'background' || previousState === 'inactive') &&
      nextAppState === 'active'
    ) {
      console.log('[AppPresenceService] App came to foreground');
      AppPresenceService._markAppOpen().catch((error) => {
        console.error('[AppPresenceService] Failed to mark app open on foreground:', error);
      });
      // Heartbeat continues running, no need to restart
    }

    // App went to background
    if (
      previousState === 'active' &&
      (nextAppState === 'background' || nextAppState === 'inactive')
    ) {
      console.log('[AppPresenceService] App went to background, continuing heartbeats');
      // Continue sending heartbeats in background
      // Don't stop heartbeat or mark as closed - keep app marked as open
    }
  },

  /**
   * Start the heartbeat interval
   */
  _startHeartbeat: (): void => {
    // Clear any existing interval
    AppPresenceService._stopHeartbeat();

    console.log('[AppPresenceService] Starting heartbeat interval');
    AppPresenceService._heartbeatInterval = setInterval(() => {
      AppPresenceService._sendHeartbeat().catch((error) => {
        console.error('[AppPresenceService] Heartbeat failed:', error);
      });
    }, HEARTBEAT_INTERVAL_MS);
  },

  /**
   * Stop the heartbeat interval
   */
  _stopHeartbeat: (): void => {
    if (AppPresenceService._heartbeatInterval) {
      console.log('[AppPresenceService] Stopping heartbeat interval');
      clearInterval(AppPresenceService._heartbeatInterval);
      AppPresenceService._heartbeatInterval = null;
    }
  },

  /**
   * Mark app as open in Firestore
   */
  _markAppOpen: async (): Promise<void> => {
    if (!AppPresenceService._userId) {
      return;
    }

    try {
      await FirestoreService.markAppOpen(AppPresenceService._userId);
      console.log('[AppPresenceService] Marked app as open');
    } catch (error) {
      console.error('[AppPresenceService] Failed to mark app as open:', error);
    }
  },

  /**
   * Send heartbeat to Firestore
   */
  _sendHeartbeat: async (): Promise<void> => {
    if (!AppPresenceService._userId) {
      return;
    }

    try {
      await FirestoreService.sendHeartbeat(AppPresenceService._userId);
      console.log('[AppPresenceService] Heartbeat sent');
    } catch (error) {
      console.error('[AppPresenceService] Failed to send heartbeat:', error);
    }
  },

  /**
   * Mark app as closed in Firestore
   */
  _markAppClosed: async (): Promise<void> => {
    if (!AppPresenceService._userId) {
      return;
    }

    try {
      await FirestoreService.markAppClosed(AppPresenceService._userId);
      console.log('[AppPresenceService] Marked app as closed');
    } catch (error) {
      console.error('[AppPresenceService] Failed to mark app as closed:', error);
    }
  },
};
