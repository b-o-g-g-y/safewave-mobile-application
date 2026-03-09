import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

/**
 * Firebase Auth user representation
 */
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  primaryProviderId?: string | null;
}

/**
 * User role types
 */
export type UserRole = 'super_admin' | 'org_admin' | 'user';

/**
 * Firestore user document (users/{userId})
 */
export interface UserDocument {
  displayName: string | null;
  email: string;
  organizationId: string;
  role: UserRole;
  bands: BandReference[];
  lastOnline?: FirebaseFirestoreTypes.Timestamp;
  createdAt?: FirebaseFirestoreTypes.Timestamp;
  createdBy?: string;
  // App presence tracking fields
  isAppOpen?: boolean;
  lastHeartbeat?: FirebaseFirestoreTypes.Timestamp | null;
  appOpenedAt?: FirebaseFirestoreTypes.Timestamp | null;
}

/**
 * Band reference stored in user document
 */
export interface BandReference {
  bandId: string; // BLE device remoteId
  status: 'true' | 'false'; // Connection status as string (matching Flutter implementation)
  lastConnectedDate: string; // ISO 8601 timestamp
}

/**
 * Organization document in Firestore (organizations/{orgId})
 */
export interface OrganizationDocument {
  id: string; // Document ID
  name: string;
  type: string;
  createdAt?: FirebaseFirestoreTypes.Timestamp;
}

/**
 * App configuration document (application/{docId})
 */
export interface ApplicationDocument {
  enabled: boolean;
  name: string;
  bundleIdentifier: string;
  imgURL: string; // iOS only (empty for Android)
  userId: string;
  bandId: string;
  appPlatform: 'android' | 'ios';
  config: VibrationConfig;
}

/**
 * Vibration configuration for app notifications
 */
export interface VibrationConfig {
  numberOfVibrations: number; // 1-10
  strength: number; // 1-100
  secondaryNumberOfVibrations?: number;
  secondaryStrength?: number;
  phrases?: string[]; // Keywords for priority notifications
}

/**
 * History document (history/{docId})
 */
export interface HistoryDocument {
  id?: string;
  appName: string;
  bundleIdentifier: string;
  userId: string;
  message: string;
  date: FirebaseFirestoreTypes.Timestamp;
}

/**
 * Firmware update info (GlobalVariables/FirmwareUpdate)
 */
export interface FirmwareUpdateDocument {
  updateAvailable: boolean;
  version: string;
  url: string;
}

/**
 * Contact form submission (contact_submissions/{docId})
 */
export interface ContactSubmissionDocument {
  name: string;
  email: string;
  message: string;
  timestamp: FirebaseFirestoreTypes.Timestamp;
  status: 'new' | 'handled';
}

/**
 * iOS available app from curated list (iOS_available_apps/{docId})
 */
export interface IOSAppDocument {
  appName: string;
  bundleId: string;
  imgURL: string;
}

/**
 * Auth state for the store
 */
export interface AuthState {
  user: User | null;
  userDocument: UserDocument | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

/**
 * Sign up form data
 */
export interface SignUpData {
  email: string;
  password: string;
  displayName: string;
}

/**
 * Sign in form data
 */
export interface SignInData {
  email: string;
  password: string;
}

/**
 * Auth error with code for specific handling
 */
export interface AuthError {
  code: string;
  message: string;
}

// ==================== BAND MANAGEMENT ====================

/**
 * Band status types
 */
export type BandStatus = 'registered' | 'assigned';

/**
 * Band document in Firestore (bands/{bandId})
 */
export interface BandDocument {
  id?: string;
  name: string; // Unique BLE advertised name per organization
  organizationId: string;
  assignedUserId: string | null;
  status: BandStatus;
  registeredAt: FirebaseFirestoreTypes.Timestamp;
  registeredBy: string; // Admin userId who registered the band
  assignedAt: FirebaseFirestoreTypes.Timestamp | null;
  assignedBy: string | null; // Admin userId who assigned the band
  batteryLevel: number | null; // 0-100, updated on connection/disconnect
  lastConnected: FirebaseFirestoreTypes.Timestamp | null;
  lastDisconnected: FirebaseFirestoreTypes.Timestamp | null;
  isConnected?: boolean; // connection status from heartbeat
}

// ==================== ACTIVITY LOGGING ====================

/**
 * Activity log event types
 */
export type ActivityLogType =
  | 'unauthorized_band_attempt'
  | 'band_connected'
  | 'band_disconnected'
  | 'app_closed'
  | 'low_battery'
  | 'user_login'
  | 'user_logout';

/**
 * Device platform for activity logs
 */
export type DevicePlatform = 'ios' | 'android';

/**
 * Activity log status
 */
export type ActivityLogStatus = 'new' | 'reviewed';

/**
 * Activity log metadata - varies by event type
 */
export interface ActivityLogMetadata {
  bandName?: string;
  reason?: string; // For band_disconnected
  wasConnected?: boolean; // For app_closed
  batteryLevel?: number; // For low_battery
}

/**
 * Activity log document in Firestore (activity_logs/{logId})
 */
export interface ActivityLogDocument {
  id?: string;
  type: ActivityLogType;
  userId: string;
  userEmail: string;
  organizationId: string;
  timestamp: FirebaseFirestoreTypes.Timestamp;
  devicePlatform: DevicePlatform;
  status: ActivityLogStatus;
  metadata: ActivityLogMetadata;
}
