"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccount = void 0;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const adminAuth = (0, auth_1.getAuth)();
const MAX_BATCH_OPERATIONS = 400;
const Collections = {
    USERS: 'users',
    APPLICATIONS: 'application',
    HISTORY: 'history',
    BANDS: 'bands',
    ACTIVITY_LOGS: 'activity_logs',
};
const commitInChunks = async (operations) => {
    for (let index = 0; index < operations.length; index += MAX_BATCH_OPERATIONS) {
        const batch = db.batch();
        operations.slice(index, index + MAX_BATCH_OPERATIONS).forEach((operation) => operation(batch));
        await batch.commit();
    }
};
const mergeBandUpdate = (bandUpdates, bandId, updates) => {
    const existing = bandUpdates.get(bandId) || {};
    bandUpdates.set(bandId, { ...existing, ...updates });
};
exports.deleteAccount = (0, https_1.onCall)(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to delete your account.');
    }
    const userRef = db.collection(Collections.USERS).doc(uid);
    const [applicationsSnapshot, historySnapshot, activityLogsSnapshot, assignedBandsSnapshot, assignedByBandsSnapshot, registeredBandsSnapshot,] = await Promise.all([
        db.collection(Collections.APPLICATIONS).where('userId', '==', uid).get(),
        db.collection(Collections.HISTORY).where('userId', '==', uid).get(),
        db.collection(Collections.ACTIVITY_LOGS).where('userId', '==', uid).get(),
        db.collection(Collections.BANDS).where('assignedUserId', '==', uid).get(),
        db.collection(Collections.BANDS).where('assignedBy', '==', uid).get(),
        db.collection(Collections.BANDS).where('registeredBy', '==', uid).get(),
    ]);
    const bandUpdates = new Map();
    assignedBandsSnapshot.docs.forEach((snapshot) => {
        mergeBandUpdate(bandUpdates, snapshot.id, {
            assignedUserId: null,
            assignedAt: null,
            assignedBy: null,
            status: 'registered',
        });
    });
    assignedByBandsSnapshot.docs.forEach((snapshot) => {
        mergeBandUpdate(bandUpdates, snapshot.id, {
            assignedBy: null,
        });
    });
    registeredBandsSnapshot.docs.forEach((snapshot) => {
        mergeBandUpdate(bandUpdates, snapshot.id, {
            registeredBy: 'deleted_account',
        });
    });
    const operations = [
        (batch) => batch.delete(userRef),
    ];
    applicationsSnapshot.docs.forEach((snapshot) => {
        operations.push((batch) => batch.delete(snapshot.ref));
    });
    historySnapshot.docs.forEach((snapshot) => {
        operations.push((batch) => batch.delete(snapshot.ref));
    });
    activityLogsSnapshot.docs.forEach((snapshot) => {
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
