import {
  getFirestore,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from '@react-native-firebase/firestore';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { Platform } from 'react-native';
import {
  UserDocument,
  BandReference,
  ApplicationDocument,
  HistoryDocument,
  FirmwareUpdateDocument,
  ContactSubmissionDocument,
  IOSAppDocument,
  BandDocument,
  ActivityLogDocument,
  ActivityLogType,
  ActivityLogMetadata,
  DevicePlatform,
  OrganizationDocument,
} from '../../types/user';
import { Collections, GlobalDocuments } from './config';

const db = () => getFirestore();

// Track which band names we've already logged "not registered" for to avoid log spam
const bandNotRegisteredLogged = new Set<string>();
const MAX_BATCH_WRITES = 400;

const commitBatchedWrites = async (
  operations: Array<(batch: FirebaseFirestoreTypes.WriteBatch) => void>
): Promise<void> => {
  for (let index = 0; index < operations.length; index += MAX_BATCH_WRITES) {
    const batch = writeBatch(db());
    operations.slice(index, index + MAX_BATCH_WRITES).forEach((operation) => operation(batch));
    await batch.commit();
  }
};

/**
 * Firestore service for all database operations (modular API)
 */
export const FirestoreService = {
  // ==================== USER OPERATIONS ====================

  /**
   * Create a new user document
   */
  createUser: async (
    userId: string,
    data: Omit<UserDocument, 'lastOnline' | 'isAppOpen' | 'lastHeartbeat' | 'appOpenedAt'>
  ): Promise<void> => {
    await setDoc(doc(db(), Collections.USERS, userId), {
      ...data,
      lastOnline: serverTimestamp(),
      // Initialize presence tracking fields
      isAppOpen: false,
      lastHeartbeat: null,
      appOpenedAt: null,
    });
  },

  /**
   * Get user document by ID
   */
  getUser: async (userId: string): Promise<UserDocument | null> => {
    const snapshot = await getDoc(doc(db(), Collections.USERS, userId));
    if (!snapshot.exists()) return null;
    return snapshot.data() as UserDocument;
  },

  /**
   * Update user document
   */
  updateUser: async (
    userId: string,
    data: Partial<UserDocument>
  ): Promise<void> => {
    await updateDoc(doc(db(), Collections.USERS, userId), {
      ...data,
      lastOnline: serverTimestamp(),
    });
  },

  /**
   * Update user's last online timestamp
   */
  updateLastOnline: async (userId: string): Promise<void> => {
    await updateDoc(doc(db(), Collections.USERS, userId), {
      lastOnline: serverTimestamp(),
    });
  },

  // ==================== APP PRESENCE OPERATIONS ====================

  /**
   * Mark app as open and start presence tracking
   * Called when app comes to foreground
   */
  markAppOpen: async (userId: string): Promise<void> => {
    await updateDoc(doc(db(), Collections.USERS, userId), {
      isAppOpen: true,
      appOpenedAt: serverTimestamp(),
      lastHeartbeat: serverTimestamp(),
      lastOnline: serverTimestamp(),
    });
  },

  /**
   * Send heartbeat to indicate app is still active
   * Called periodically while app is in foreground
   */
  sendHeartbeat: async (userId: string): Promise<void> => {
    await updateDoc(doc(db(), Collections.USERS, userId), {
      lastHeartbeat: serverTimestamp(),
      lastOnline: serverTimestamp(),
    });
  },

  /**
   * Mark app as closed (fallback when app goes to background)
   * Note: This may not be called if app is force-killed
   */
  markAppClosed: async (userId: string): Promise<void> => {
    await updateDoc(doc(db(), Collections.USERS, userId), {
      isAppOpen: false,
      lastOnline: serverTimestamp(),
    });
  },

  /**
   * Delete user document and all associated data
   */
  deleteUser: async (userId: string): Promise<void> => {
    const userRef = doc(db(), Collections.USERS, userId);
    const [
      appsSnapshot,
      historySnapshot,
      activityLogsSnapshot,
      assignedBandsSnapshot,
      assignedByBandsSnapshot,
      registeredBandsSnapshot,
    ] = await Promise.all([
      getDocs(query(collection(db(), Collections.APPLICATIONS), where('userId', '==', userId))),
      getDocs(query(collection(db(), Collections.HISTORY), where('userId', '==', userId))),
      getDocs(query(collection(db(), Collections.ACTIVITY_LOGS), where('userId', '==', userId))),
      getDocs(query(collection(db(), Collections.BANDS), where('assignedUserId', '==', userId))),
      getDocs(query(collection(db(), Collections.BANDS), where('assignedBy', '==', userId))),
      getDocs(query(collection(db(), Collections.BANDS), where('registeredBy', '==', userId))),
    ]);

    const bandUpdates = new Map<string, Partial<BandDocument>>();
    const upsertBandUpdate = (bandId: string, updates: Partial<BandDocument>) => {
      const existingUpdates = bandUpdates.get(bandId) || {};
      bandUpdates.set(bandId, { ...existingUpdates, ...updates });
    };

    assignedBandsSnapshot.docs.forEach((snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
      upsertBandUpdate(snapshot.id, {
        assignedUserId: null,
        assignedAt: null,
        assignedBy: null,
        status: 'registered',
      });
    });

    assignedByBandsSnapshot.docs.forEach((snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
      upsertBandUpdate(snapshot.id, {
        assignedBy: null,
      });
    });

    registeredBandsSnapshot.docs.forEach((snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
      upsertBandUpdate(snapshot.id, {
        registeredBy: 'deleted_account',
      });
    });

    const operations: Array<(batch: FirebaseFirestoreTypes.WriteBatch) => void> = [
      (batch) => batch.delete(userRef),
    ];

    appsSnapshot.docs.forEach((snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
      operations.push((batch) => batch.delete(snapshot.ref));
    });

    historySnapshot.docs.forEach((snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
      operations.push((batch) => batch.delete(snapshot.ref));
    });

    activityLogsSnapshot.docs.forEach((snapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
      operations.push((batch) => batch.delete(snapshot.ref));
    });

    bandUpdates.forEach((updates, bandId) => {
      operations.push((batch) => {
        batch.update(doc(db(), Collections.BANDS, bandId), updates);
      });
    });

    await commitBatchedWrites(operations);
  },

  /**
   * Subscribe to user document changes
   */
  subscribeToUser: (
    userId: string,
    callback: (user: UserDocument | null) => void
  ): (() => void) => {
    return onSnapshot(
      doc(db(), Collections.USERS, userId),
      (snapshot) => {
        callback(snapshot.exists() ? (snapshot.data() as UserDocument) : null);
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
    await updateDoc(doc(db(), Collections.USERS, userId), { bands });
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

  // ==================== BAND REGISTRATION OPERATIONS ====================

  /**
   * Register a new band (admin only)
   * @param name Unique BLE advertised name for the band
   * @param organizationId Organization the band belongs to
   * @param registeredBy Admin userId who is registering the band
   */
  registerBand: async (
    name: string,
    organizationId: string,
    registeredBy: string
  ): Promise<string> => {
    const docRef = await addDoc(collection(db(), Collections.BANDS), {
      name,
      organizationId,
      assignedUserId: null,
      status: 'registered',
      registeredAt: serverTimestamp(),
      registeredBy,
      assignedAt: null,
      assignedBy: null,
      batteryLevel: null,
      lastConnected: null,
      lastDisconnected: null,
      isConnected: false,
    });
    return docRef.id;
  },

  /**
   * Register a band or update an existing band with the same name (admin only)
   * @param name Unique BLE advertised name for the band
   * @param organizationId Organization the band belongs to
   * @param registeredBy Admin userId who is registering the band
   */
  upsertRegisteredBandByName: async (
    name: string,
    organizationId: string,
    registeredBy: string
  ): Promise<string> => {
    const existingBand = await FirestoreService.getBandByName(name, organizationId);

    if (existingBand?.id) {
      await updateDoc(doc(db(), Collections.BANDS, existingBand.id), {
        name,
        organizationId,
        registeredBy,
        registeredAt: serverTimestamp(),
        status: 'registered',
      });
      return existingBand.id;
    }

    return FirestoreService.registerBand(name, organizationId, registeredBy);
  },

  /**
   * Get bands assigned to a specific user
   * @param userId User ID to get assigned bands for
   */
  getUserAssignedBands: async (userId: string): Promise<BandDocument[]> => {
    const q = query(
      collection(db(), Collections.BANDS),
      where('assignedUserId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({
      ...d.data(),
      id: d.id,
    })) as BandDocument[];
  },

  /**
   * Get a band by its name within an organization
   * Used to check name uniqueness during registration
   * @param name Band name to search for
   * @param organizationId Organization to search within
   */
  getBandByName: async (
    name: string,
    organizationId: string
  ): Promise<BandDocument | null> => {
    try {
      const q = query(
        collection(db(), Collections.BANDS),
        where('name', '==', name),
        where('organizationId', '==', organizationId),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      const d = snapshot.docs[0];
      return {
        ...d.data(),
        id: d.id,
      } as BandDocument;
    } catch (error: any) {
      // Permission denied may occur if user doesn't have access to query bands
      console.log('[FirestoreService] Could not query band by name:', name, error.message);
      return null;
    }
  },

  /**
   * Update a band's name in Firebase
   * Used when renaming an already registered band
   * @param oldName Current band name to search for
   * @param newName New name to set
   * @param organizationId Organization the band belongs to
   * @returns true if band was found and updated, false otherwise
   */
  updateBandName: async (
    oldName: string,
    newName: string,
    organizationId: string
  ): Promise<boolean> => {
    try {
      const existingBand = await FirestoreService.getBandByName(oldName, organizationId);
      if (!existingBand?.id) {
        console.log('[FirestoreService] Band not found for rename:', oldName);
        return false;
      }

      await updateDoc(doc(db(), Collections.BANDS, existingBand.id), {
        name: newName,
      });
      console.log('[FirestoreService] Band renamed in Firebase:', oldName, '->', newName);
      return true;
    } catch (error: any) {
      console.error('[FirestoreService] Error updating band name:', error.message);
      return false;
    }
  },

  /**
   * Update band status (battery, lastConnected, lastDisconnected)
   * @param bandName The BLE advertised name of the band
   * @param organizationId Organization the band belongs to
   * @param updates Partial updates to apply
   * 
   * Note: This will fail silently if the band is not registered or not assigned
   * to the current user. This is expected behavior for unregistered bands.
   */
  updateBandStatus: async (
    bandName: string,
    organizationId: string,
    updates: {
      batteryLevel?: number | null;
      lastConnected?: boolean; // If true, sets to server timestamp
      lastDisconnected?: boolean; // If true, sets to server timestamp
      isConnected?: boolean;
    }
  ): Promise<void> => {
    try {
      // Find the band by name
      const band = await FirestoreService.getBandByName(bandName, organizationId);
      if (!band || !band.id) {
        // Only log once per band name to avoid spam
        if (!bandNotRegisteredLogged.has(bandName)) {
          console.log('[FirestoreService] Band not registered, skipping status updates:', bandName);
          bandNotRegisteredLogged.add(bandName);
        }
        return;
      }

      const updateData: Record<string, any> = {};

      if (updates.batteryLevel !== undefined) {
        updateData.batteryLevel = updates.batteryLevel;
      }
      if (updates.lastConnected) {
        updateData.lastConnected = serverTimestamp();
      }
      if (updates.lastDisconnected) {
        updateData.lastDisconnected = serverTimestamp();
      }
      if (updates.isConnected !== undefined) {
        updateData.isConnected = updates.isConnected;
      }

      if (Object.keys(updateData).length > 0) {
        await updateDoc(doc(db(), Collections.BANDS, band.id), updateData);
      }
    } catch (error: any) {
      // Permission denied is expected if band is not assigned to user
      // or band is not registered yet
      console.log('[FirestoreService] Could not update band status (may not be registered/assigned):', bandName, error.message);
    }
  },

  /**
   * Update band heartbeat (lastSeen + isConnected)
   * @param bandName The BLE advertised name of the band
   * @param organizationId Organization the band belongs to
   * @param batteryLevel Optional battery level
   */
  updateBandHeartbeat: async (
    bandName: string,
    organizationId: string,
    batteryLevel?: number | null
  ): Promise<void> => {
    return FirestoreService.updateBandStatus(bandName, organizationId, {
      isConnected: true,
      lastConnected: true,
      batteryLevel,
    });
  },

  // ==================== ORGANIZATION OPERATIONS ====================

  /**
   * Get all organizations (for super_admin use)
   * @returns Array of organization documents
   */
  getAllOrganizations: async (): Promise<OrganizationDocument[]> => {
    try {
      const q = query(
        collection(db(), Collections.ORGANIZATIONS),
        orderBy('name')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({
        ...d.data(),
        id: d.id,
      })) as OrganizationDocument[];
    } catch (error: any) {
      console.error('[FirestoreService] Error fetching organizations:', error.message);
      return [];
    }
  },

  // ==================== ACTIVITY LOG OPERATIONS ====================

  /**
   * Create an activity log entry
   * @param data Activity log data
   */
  createActivityLog: async (data: {
    type: ActivityLogType;
    userId: string;
    userEmail: string;
    organizationId: string;
    metadata?: ActivityLogMetadata;
  }): Promise<void> => {
    const devicePlatform: DevicePlatform = Platform.OS === 'ios' ? 'ios' : 'android';

    await addDoc(collection(db(), Collections.ACTIVITY_LOGS), {
      type: data.type,
      userId: data.userId,
      userEmail: data.userEmail,
      organizationId: data.organizationId,
      timestamp: serverTimestamp(),
      devicePlatform,
      status: 'new',
      metadata: data.metadata || {},
    });
  },

  // ==================== APPLICATION OPERATIONS ====================

  /**
   * Get user's app configurations
   */
  getApps: async (userId: string): Promise<ApplicationDocument[]> => {
    const q = query(
      collection(db(), Collections.APPLICATIONS),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({
      ...d.data(),
      id: d.id,
    })) as ApplicationDocument[];
  },

  /**
   * Create multiple app configurations
   */
  createApps: async (
    apps: Omit<ApplicationDocument, 'userId'>[],
    userId: string
  ): Promise<void> => {
    const batch = writeBatch(db());
    const col = collection(db(), Collections.APPLICATIONS);

    apps.forEach((app) => {
      const docRef = doc(col);
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
    await updateDoc(doc(db(), Collections.APPLICATIONS, appId), data);
  },

  /**
   * Delete an app configuration
   */
  deleteApp: async (appId: string): Promise<void> => {
    await deleteDoc(doc(db(), Collections.APPLICATIONS, appId));
  },

  /**
   * Subscribe to user's apps
   */
  subscribeToApps: (
    userId: string,
    callback: (apps: ApplicationDocument[]) => void
  ): (() => void) => {
    const q = query(
      collection(db(), Collections.APPLICATIONS),
      where('userId', '==', userId)
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const apps = snapshot.docs.map((d: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({
          ...d.data(),
          id: d.id,
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

    const q = query(
      collection(db(), Collections.HISTORY),
      where('userId', '==', userId),
      where('date', '>=', Timestamp.fromDate(fourteenDaysAgo)),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((d: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({
      ...d.data(),
      id: d.id,
    })) as HistoryDocument[];
  },

  /**
   * Create a history record
   */
  createHistory: async (
    data: Omit<HistoryDocument, 'id' | 'date'>
  ): Promise<void> => {
    await addDoc(collection(db(), Collections.HISTORY), {
      ...data,
      date: serverTimestamp(),
    });
  },

  /**
   * Delete a history record
   */
  deleteHistory: async (historyId: string): Promise<void> => {
    await deleteDoc(doc(db(), Collections.HISTORY, historyId));
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

    const q = query(
      collection(db(), Collections.HISTORY),
      where('userId', '==', userId),
      where('date', '>=', Timestamp.fromDate(fourteenDaysAgo)),
      orderBy('date', 'desc')
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const history = snapshot.docs.map((d: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({
          ...d.data(),
          id: d.id,
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
    const snapshot = await getDoc(
      doc(db(), Collections.GLOBAL_VARIABLES, GlobalDocuments.FIRMWARE_UPDATE)
    );

    if (!snapshot.exists()) return null;
    return snapshot.data() as FirmwareUpdateDocument;
  },

  /**
   * Subscribe to firmware update info
   */
  subscribeToFirmwareInfo: (
    callback: (info: FirmwareUpdateDocument | null) => void
  ): (() => void) => {
    return onSnapshot(
      doc(db(), Collections.GLOBAL_VARIABLES, GlobalDocuments.FIRMWARE_UPDATE),
      (snapshot) => {
        callback(snapshot.exists() ? (snapshot.data() as FirmwareUpdateDocument) : null);
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
    const snapshot = await getDocs(collection(db(), Collections.IOS_AVAILABLE_APPS));
    return snapshot.docs.map((d: FirebaseFirestoreTypes.QueryDocumentSnapshot) => d.data()) as IOSAppDocument[];
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
    await addDoc(collection(db(), Collections.CONTACT_SUBMISSIONS), {
      ...data,
      timestamp: serverTimestamp(),
      status: 'new',
    });
  },
};
