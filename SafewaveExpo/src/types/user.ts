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
}

/**
 * Firestore user document (users/{userId})
 */
export interface UserDocument {
  displayName: string;
  email: string;
  bands: BandReference[];
  lastOnline?: FirebaseFirestoreTypes.Timestamp;
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
