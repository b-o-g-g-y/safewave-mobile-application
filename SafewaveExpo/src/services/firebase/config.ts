import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { Platform } from 'react-native';

// Firebase is normally auto-initialized from native config files.
// Add a JS fallback to avoid crashes if native config wasn't embedded.

const firebaseConfig = Platform.select({
  ios: {
    apiKey: 'AIzaSyCdWXAoa-eP7RBPWhugjSoh8aSCaDk73fg',
    appId: '1:393568702648:ios:93690b8dd473f76388644d',
    projectId: 'safewave-371716',
    messagingSenderId: '393568702648',
    storageBucket: 'safewave-371716.appspot.com',
  },
  android: {
    apiKey: 'AIzaSyD-_xQ9uEKmWWhU8uUC3rZG1omdX8Rbn8U',
    appId: '1:393568702648:android:202082053780f47f88644d',
    projectId: 'safewave-371716',
    messagingSenderId: '393568702648',
    storageBucket: 'safewave-371716.appspot.com',
  },
});

export const ensureFirebaseApp = (): void => {
  if (!firebase.apps.length && firebaseConfig) {
    firebase.initializeApp(firebaseConfig);
  }
};

export { firebase, auth };

// Use getter functions for lazy initialization
// This ensures Firebase native SDK is ready before accessing instances
export const getFirebaseAuth = () => auth();
export const getFirestoreDb = () => getFirestore();

// Ensure the default app exists as soon as this module loads.
ensureFirebaseApp();

// Collection names as constants
export const Collections = {
  USERS: 'users',
  APPLICATIONS: 'application',
  HISTORY: 'history',
  GLOBAL_VARIABLES: 'GlobalVariables',
  IOS_AVAILABLE_APPS: 'iOS_available_apps',
  CONTACT_SUBMISSIONS: 'contact_submissions',
  BANDS: 'bands',
  ACTIVITY_LOGS: 'activity_logs',
  ORGANIZATIONS: 'organizations',
} as const;

// Document IDs for global variables
export const GlobalDocuments = {
  FIRMWARE_UPDATE: 'FirmwareUpdate',
} as const;
