import { VibrationCommand } from './bluetooth';

/**
 * The data-only FCM payload the backend sends for an admin alert. FCM data
 * values are always strings, so nothing here is a number or a boolean.
 */
export const ALERT_MESSAGE_TYPE = 'safewave_alert';

/**
 * An alert pushed from the admin dashboard, awaiting acknowledgement.
 */
export interface SafewaveAlert {
  notificationId: string;
  title: string;
  body: string;
  receivedAt: number;
}

/**
 * Which route acknowledged an alert: the in-app popup, or the physical button
 * on the band. Both call the same callable; this is only for logging.
 */
export type AckSource = 'popup' | 'band';

/**
 * Buzz played when an admin alert arrives.
 *
 * numBuzzes: 0 means "vibrate until the physical button is pressed" — the band
 * keeps buzzing until the user actually acknowledges, which is what a safety
 * alert wants.
 */
export const ALERT_VIBRATION: VibrationCommand = {
  strength: 100,
  numBuzzes: 0,
  dutyOfBuzz: 50,
  durationOfDelay: 50,
};

/**
 * Buzz played when the user acknowledges from the popup.
 *
 * Two jobs: stop the alert buzz (there is no BLE "stop" command, so a new write
 * is the only lever we have), and confirm the tap haptically so the user feels
 * that it registered.
 *
 * NOTE: whether a write actually preempts an in-flight buzz is unverified on
 * hardware. If it turns out the band ignores writes while the motor is running,
 * make ALERT_VIBRATION finite (e.g. numBuzzes: 5) so it self-terminates — that
 * is the only change needed, which is why both commands live here.
 */
export const ALERT_ACK_VIBRATION: VibrationCommand = {
  strength: 30,
  numBuzzes: 1,
  dutyOfBuzz: 10,
  durationOfDelay: 10,
};
