import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';

import { AlertService } from './AlertService';

/**
 * Registers the FCM background message handler.
 *
 * Imported for its side effect from index.ts, before registerRootComponent:
 * on a cold background delivery, React Native evaluates the bundle and looks
 * for the registered handler immediately, so registering it inside the React
 * tree would be too late.
 *
 * Keep this module's import graph narrow (no App, no navigator) so a background
 * delivery doesn't pay to mount the whole app. Importing the stores is fine —
 * they're plain zustand, and importing bluetoothStore does not construct a
 * BleManager (that's lazy, in BLEManager.getBleManager()).
 */
setBackgroundMessageHandler(getMessaging(), async (message) => {
  await AlertService.handleRemoteMessage(message);
});
