import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_DEVICE_ID = '@safewave/device_id';

/**
 * Random v4-shaped id. Not cryptographically strong, and doesn't need to be:
 * this is a Firestore document key scoped under users/{uid}, not a secret. A
 * collision would have to happen within a single user's handful of installs.
 */
const randomId = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

let cachedDeviceId: string | null = null;

/**
 * Stable per-install identifier, used to key users/{uid}/devices/{deviceId}.
 *
 * Keying the device doc on this rather than on the FCM token means a token
 * refresh updates one doc in place instead of orphaning the old one.
 *
 * It does not survive a reinstall (AsyncStorage is cleared), which is fine: a
 * reinstall gets a fresh FCM token anyway, so it genuinely is a new device.
 * The cost is that the old doc lingers, holding a token FCM will report as
 * UNREGISTERED — the backend prunes those.
 */
export const getDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) return cachedDeviceId;

  const stored = await AsyncStorage.getItem(STORAGE_KEY_DEVICE_ID);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }

  const generated = randomId();
  await AsyncStorage.setItem(STORAGE_KEY_DEVICE_ID, generated);
  cachedDeviceId = generated;
  return generated;
};
