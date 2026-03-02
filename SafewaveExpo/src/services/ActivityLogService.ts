import { FirestoreService } from './firebase/FirestoreService';
import { useAuthStore } from '../store/authStore';
import { ActivityLogType, ActivityLogMetadata } from '../types/user';

/**
 * ActivityLogService - Centralized service for logging user/band events to Firebase
 * 
 * This service pushes activity logs that are visible in the admin dashboard.
 * Events are logged with user context, timestamp, and device platform.
 */
export const ActivityLogService = {
  /**
   * Get current user context for logging
   * Returns null if user is not authenticated
   */
  _getUserContext: (): {
    userId: string;
    userEmail: string;
    organizationId: string;
  } | null => {
    const { user, userDocument } = useAuthStore.getState();

    if (!user || !userDocument) {
      console.warn('[ActivityLogService] Cannot log event - user not authenticated');
      return null;
    }

    const userEmail = user.email || userDocument.email;
    const organizationId = userDocument.organizationId;

    if (!userEmail || !organizationId) {
      console.warn('[ActivityLogService] Cannot log event - missing userEmail:', userEmail, 'organizationId:', organizationId, 'userDoc keys:', Object.keys(userDocument));
      return null;
    }

    return {
      userId: user.uid,
      userEmail,
      organizationId,
    };
  },

  /**
   * Internal method to create a log entry
   * Strips undefined values from metadata (Firestore does not accept undefined)
   */
  _log: async (
    type: ActivityLogType,
    metadata?: ActivityLogMetadata
  ): Promise<void> => {
    const context = ActivityLogService._getUserContext();
    if (!context) return;

    const safeMetadata = metadata
      ? (Object.fromEntries(
        Object.entries(metadata).filter(([, v]) => v !== undefined)
      ) as ActivityLogMetadata)
      : undefined;

    try {
      await FirestoreService.createActivityLog({
        type,
        userId: context.userId,
        userEmail: context.userEmail,
        organizationId: context.organizationId,
        metadata: safeMetadata,
      });
      console.log('[ActivityLogService] Logged event:', type, safeMetadata);
    } catch (error) {
      console.error('[ActivityLogService] Failed to log event:', type, error);
    }
  },

  /**
   * Log unauthorized band connection attempt
   * Called when a user tries to connect to a band not assigned to them
   */
  logUnauthorizedBandAttempt: async (bandName: string): Promise<void> => {
    await ActivityLogService._log('unauthorized_band_attempt', { bandName });
  },

  /**
   * Log successful band connection
   */
  logBandConnected: async (bandName: string): Promise<void> => {
    await ActivityLogService._log('band_connected', { bandName });
  },

  /**
   * Log band disconnection
   * @param bandName Name of the band that disconnected
   * @param reason Optional reason for disconnection (e.g., 'user_initiated', 'bluetooth_off', 'out_of_range')
   */
  logBandDisconnected: async (bandName: string, reason?: string): Promise<void> => {
    await ActivityLogService._log('band_disconnected', { bandName, reason });
  },

  /**
   * Log app closed/backgrounded
   * @param wasConnected Whether a band was connected when the app closed
   * @param bandName Name of the connected band (if any)
   */
  logAppClosed: async (wasConnected: boolean, bandName?: string): Promise<void> => {
    await ActivityLogService._log('app_closed', { wasConnected, bandName });
  },

  /**
   * Log low battery warning
   * @param bandName Name of the band with low battery
   * @param batteryLevel Current battery level (0-100)
   */
  logLowBattery: async (bandName: string, batteryLevel: number): Promise<void> => {
    await ActivityLogService._log('low_battery', { bandName, batteryLevel });
  },

  /**
   * Log user login
   */
  logUserLogin: async (): Promise<void> => {
    await ActivityLogService._log('user_login');
  },

  /**
   * Log user logout
   */
  logUserLogout: async (): Promise<void> => {
    await ActivityLogService._log('user_logout');
  },
};
