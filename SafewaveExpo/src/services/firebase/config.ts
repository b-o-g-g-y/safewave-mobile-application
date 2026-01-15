import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

// Firebase is auto-initialized from GoogleService-Info.plist (iOS) 
// and google-services.json (Android) via native configuration.
// No manual initialization required with @react-native-firebase.

export { firebase, auth, firestore };

// Export the default instances for convenience
export const firebaseAuth = auth();
export const firestoreDb = firestore();

// Collection names as constants
export const Collections = {
  USERS: 'users',
  APPLICATIONS: 'application',
  HISTORY: 'history',
  GLOBAL_VARIABLES: 'GlobalVariables',
  IOS_AVAILABLE_APPS: 'iOS_available_apps',
  CONTACT_SUBMISSIONS: 'contact_submissions',
} as const;

// Document IDs for global variables
export const GlobalDocuments = {
  FIRMWARE_UPDATE: 'FirmwareUpdate',
} as const;
