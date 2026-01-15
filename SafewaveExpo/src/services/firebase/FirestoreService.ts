import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import {
  UserDocument,
  BandReference,
  ApplicationDocument,
  HistoryDocument,
  FirmwareUpdateDocument,
  ContactSubmissionDocument,
  IOSAppDocument,
} from '../../types/user';
import { Collections, GlobalDocuments } from './config';

/**
 * Firestore service for all database operations
 */
export const FirestoreService = {
  // ==================== USER OPERATIONS ====================

  /**
   * Create a new user document
   */
  createUser: async (
    userId: string,
    data: Omit<UserDocument, 'lastOnline'>
  ): Promise<void> => {
    await firestore().collection(Collections.USERS).doc(userId).set({
      ...data,
      lastOnline: firestore.FieldValue.serverTimestamp(),
    });
  },

  /**
   * Get user document by ID
   */
  getUser: async (userId: string): Promise<UserDocument | null> => {
    const doc = await firestore().collection(Collections.USERS).doc(userId).get();
    if (!doc.exists) return null;
    return doc.data() as UserDocument;
  },

  /**
   * Update user document
   */
  updateUser: async (
    userId: string,
    data: Partial<UserDocument>
  ): Promise<void> => {
    await firestore().collection(Collections.USERS).doc(userId).update({
      ...data,
      lastOnline: firestore.FieldValue.serverTimestamp(),
    });
  },

  /**
   * Update user's last online timestamp
   */
  updateLastOnline: async (userId: string): Promise<void> => {
    await firestore().collection(Collections.USERS).doc(userId).update({
      lastOnline: firestore.FieldValue.serverTimestamp(),
    });
  },

  /**
   * Delete user document and all associated data
   */
  deleteUser: async (userId: string): Promise<void> => {
    const batch = firestore().batch();

    // Delete user document
    const userRef = firestore().collection(Collections.USERS).doc(userId);
    batch.delete(userRef);

    // Delete user's applications
    const appsSnapshot = await firestore()
      .collection(Collections.APPLICATIONS)
      .where('userId', '==', userId)
      .get();
    appsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));

    // Delete user's history
    const historySnapshot = await firestore()
      .collection(Collections.HISTORY)
      .where('userId', '==', userId)
      .get();
    historySnapshot.docs.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();
  },

  /**
   * Subscribe to user document changes
   */
  subscribeToUser: (
    userId: string,
    callback: (user: UserDocument | null) => void
  ): (() => void) => {
    return firestore()
      .collection(Collections.USERS)
      .doc(userId)
      .onSnapshot(
        (doc) => {
          callback(doc.exists ? (doc.data() as UserDocument) : null);
        },
        (error) => {
          console.error('Error subscribing to user:', error);
          callback(null);
        }
      );
  },

  // ==================== BAND OPERATIONS ====================

  /**
   * Get user's bands
   */
  getUserBands: async (userId: string): Promise<BandReference[]> => {
    const user = await FirestoreService.getUser(userId);
    return user?.bands || [];
  },

  /**
   * Set user's bands (replace all)
   */
  setUserBands: async (userId: string, bands: BandReference[]): Promise<void> => {
    await firestore().collection(Collections.USERS).doc(userId).update({ bands });
  },

  /**
   * Add or update a band reference
   */
  upsertBand: async (userId: string, band: BandReference): Promise<void> => {
    const bands = await FirestoreService.getUserBands(userId);
    const existingIndex = bands.findIndex((b) => b.bandId === band.bandId);
    
    if (existingIndex >= 0) {
      bands[existingIndex] = band;
    } else {
      bands.push(band);
    }
    
    await FirestoreService.setUserBands(userId, bands);
  },

  /**
   * Remove a band reference
   */
  removeBand: async (userId: string, bandId: string): Promise<void> => {
    const bands = await FirestoreService.getUserBands(userId);
    const filteredBands = bands.filter((b) => b.bandId !== bandId);
    await FirestoreService.setUserBands(userId, filteredBands);
  },

  // ==================== APPLICATION OPERATIONS ====================

  /**
   * Get user's app configurations
   */
  getApps: async (userId: string): Promise<ApplicationDocument[]> => {
    const snapshot = await firestore()
      .collection(Collections.APPLICATIONS)
      .where('userId', '==', userId)
      .get();
    
    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    })) as ApplicationDocument[];
  },

  /**
   * Create multiple app configurations
   */
  createApps: async (
    apps: Omit<ApplicationDocument, 'userId'>[],
    userId: string
  ): Promise<void> => {
    const batch = firestore().batch();
    
    apps.forEach((app) => {
      const docRef = firestore().collection(Collections.APPLICATIONS).doc();
      batch.set(docRef, { ...app, userId });
    });
    
    await batch.commit();
  },

  /**
   * Update an app configuration
   */
  updateApp: async (
    appId: string,
    data: Partial<ApplicationDocument>
  ): Promise<void> => {
    await firestore().collection(Collections.APPLICATIONS).doc(appId).update(data);
  },

  /**
   * Delete an app configuration
   */
  deleteApp: async (appId: string): Promise<void> => {
    await firestore().collection(Collections.APPLICATIONS).doc(appId).delete();
  },

  /**
   * Subscribe to user's apps
   */
  subscribeToApps: (
    userId: string,
    callback: (apps: ApplicationDocument[]) => void
  ): (() => void) => {
    return firestore()
      .collection(Collections.APPLICATIONS)
      .where('userId', '==', userId)
      .onSnapshot(
        (snapshot) => {
          const apps = snapshot.docs.map((doc) => ({
            ...doc.data(),
            id: doc.id,
          })) as ApplicationDocument[];
          callback(apps);
        },
        (error) => {
          console.error('Error subscribing to apps:', error);
          callback([]);
        }
      );
  },

  // ==================== HISTORY OPERATIONS ====================

  /**
   * Get user's notification history (last 14 days)
   */
  getHistory: async (userId: string): Promise<HistoryDocument[]> => {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    const snapshot = await firestore()
      .collection(Collections.HISTORY)
      .where('userId', '==', userId)
      .where('date', '>=', firestore.Timestamp.fromDate(fourteenDaysAgo))
      .orderBy('date', 'desc')
      .get();
    
    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    })) as HistoryDocument[];
  },

  /**
   * Create a history record
   */
  createHistory: async (
    data: Omit<HistoryDocument, 'id' | 'date'>
  ): Promise<void> => {
    await firestore().collection(Collections.HISTORY).add({
      ...data,
      date: firestore.FieldValue.serverTimestamp(),
    });
  },

  /**
   * Delete a history record
   */
  deleteHistory: async (historyId: string): Promise<void> => {
    await firestore().collection(Collections.HISTORY).doc(historyId).delete();
  },

  /**
   * Subscribe to user's history
   */
  subscribeToHistory: (
    userId: string,
    callback: (history: HistoryDocument[]) => void
  ): (() => void) => {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    return firestore()
      .collection(Collections.HISTORY)
      .where('userId', '==', userId)
      .where('date', '>=', firestore.Timestamp.fromDate(fourteenDaysAgo))
      .orderBy('date', 'desc')
      .onSnapshot(
        (snapshot) => {
          const history = snapshot.docs.map((doc) => ({
            ...doc.data(),
            id: doc.id,
          })) as HistoryDocument[];
          callback(history);
        },
        (error) => {
          console.error('Error subscribing to history:', error);
          callback([]);
        }
      );
  },

  // ==================== FIRMWARE OPERATIONS ====================

  /**
   * Get firmware update info
   */
  getFirmwareInfo: async (): Promise<FirmwareUpdateDocument | null> => {
    const doc = await firestore()
      .collection(Collections.GLOBAL_VARIABLES)
      .doc(GlobalDocuments.FIRMWARE_UPDATE)
      .get();
    
    if (!doc.exists) return null;
    return doc.data() as FirmwareUpdateDocument;
  },

  /**
   * Subscribe to firmware update info
   */
  subscribeToFirmwareInfo: (
    callback: (info: FirmwareUpdateDocument | null) => void
  ): (() => void) => {
    return firestore()
      .collection(Collections.GLOBAL_VARIABLES)
      .doc(GlobalDocuments.FIRMWARE_UPDATE)
      .onSnapshot(
        (doc) => {
          callback(doc.exists ? (doc.data() as FirmwareUpdateDocument) : null);
        },
        (error) => {
          console.error('Error subscribing to firmware info:', error);
          callback(null);
        }
      );
  },

  // ==================== iOS APPS OPERATIONS ====================

  /**
   * Get available iOS apps list
   */
  getIOSApps: async (): Promise<IOSAppDocument[]> => {
    const snapshot = await firestore().collection(Collections.IOS_AVAILABLE_APPS).get();
    return snapshot.docs.map((doc) => doc.data()) as IOSAppDocument[];
  },

  // ==================== CONTACT OPERATIONS ====================

  /**
   * Submit a contact form
   */
  submitContactForm: async (data: {
    name: string;
    email: string;
    message: string;
  }): Promise<void> => {
    await firestore().collection(Collections.CONTACT_SUBMISSIONS).add({
      ...data,
      timestamp: firestore.FieldValue.serverTimestamp(),
      status: 'new',
    });
  },
};
