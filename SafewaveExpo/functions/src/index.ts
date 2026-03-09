import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, QueryDocumentSnapshot, WriteBatch } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();
const MAX_BATCH_OPERATIONS = 400;

const Collections = {
  USERS: 'users',
  APPLICATIONS: 'application',
  HISTORY: 'history',
  BANDS: 'bands',
  ACTIVITY_LOGS: 'activity_logs',
} as const;

type BatchOperation = (batch: WriteBatch) => void;
type BandUpdate = Record<string, unknown>;

const commitInChunks = async (operations: BatchOperation[]): Promise<void> => {
  for (let index = 0; index < operations.length; index += MAX_BATCH_OPERATIONS) {
    const batch = db.batch();
    operations.slice(index, index + MAX_BATCH_OPERATIONS).forEach((operation) => operation(batch));
    await batch.commit();
  }
};

const mergeBandUpdate = (
  bandUpdates: Map<string, BandUpdate>,
  bandId: string,
  updates: BandUpdate
): void => {
  const existing = bandUpdates.get(bandId) || {};
  bandUpdates.set(bandId, { ...existing, ...updates });
};

export const deleteAccount = onCall(async (request) => {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to delete your account.');
  }

  const userRef = db.collection(Collections.USERS).doc(uid);

  const [
    applicationsSnapshot,
    historySnapshot,
    activityLogsSnapshot,
    assignedBandsSnapshot,
    assignedByBandsSnapshot,
    registeredBandsSnapshot,
  ] = await Promise.all([
    db.collection(Collections.APPLICATIONS).where('userId', '==', uid).get(),
    db.collection(Collections.HISTORY).where('userId', '==', uid).get(),
    db.collection(Collections.ACTIVITY_LOGS).where('userId', '==', uid).get(),
    db.collection(Collections.BANDS).where('assignedUserId', '==', uid).get(),
    db.collection(Collections.BANDS).where('assignedBy', '==', uid).get(),
    db.collection(Collections.BANDS).where('registeredBy', '==', uid).get(),
  ]);

  const bandUpdates = new Map<string, BandUpdate>();

  assignedBandsSnapshot.docs.forEach((snapshot: QueryDocumentSnapshot) => {
    mergeBandUpdate(bandUpdates, snapshot.id, {
      assignedUserId: null,
      assignedAt: null,
      assignedBy: null,
      status: 'registered',
    });
  });

  assignedByBandsSnapshot.docs.forEach((snapshot: QueryDocumentSnapshot) => {
    mergeBandUpdate(bandUpdates, snapshot.id, {
      assignedBy: null,
    });
  });

  registeredBandsSnapshot.docs.forEach((snapshot: QueryDocumentSnapshot) => {
    mergeBandUpdate(bandUpdates, snapshot.id, {
      registeredBy: 'deleted_account',
    });
  });

  const operations: BatchOperation[] = [
    (batch) => batch.delete(userRef),
  ];

  applicationsSnapshot.docs.forEach((snapshot: QueryDocumentSnapshot) => {
    operations.push((batch) => batch.delete(snapshot.ref));
  });

  historySnapshot.docs.forEach((snapshot: QueryDocumentSnapshot) => {
    operations.push((batch) => batch.delete(snapshot.ref));
  });

  activityLogsSnapshot.docs.forEach((snapshot: QueryDocumentSnapshot) => {
    operations.push((batch) => batch.delete(snapshot.ref));
  });

  bandUpdates.forEach((updates, bandId) => {
    operations.push((batch) => {
      batch.update(db.collection(Collections.BANDS).doc(bandId), updates);
    });
  });

  await commitInChunks(operations);
  await adminAuth.deleteUser(uid);

  return { success: true };
});
