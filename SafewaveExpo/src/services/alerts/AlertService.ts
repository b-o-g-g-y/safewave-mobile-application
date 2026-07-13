import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

import { useAlertStore } from '../../store/alertStore';
import { useBluetoothStore } from '../../store/bluetoothStore';
import { ALERT_MESSAGE_TYPE, ALERT_VIBRATION, SafewaveAlert } from '../../types/alert';
import { FirestoreService } from '../firebase/FirestoreService';

/**
 * How long to let the band's firmware connection-success buzz finish before
 * sending a queued alert buzz.
 *
 * The connect buzz is played by the band itself, not commanded by the app, so
 * there is nothing to await — this is a settle window, not a synchronisation.
 * Tune it against the firmware's connect pattern if that changes.
 */
const CONNECT_BUZZ_SETTLE_MS = 1500;

/**
 * How long a background push handler waits for BLE to come up before giving up
 * and letting the alert buzz whenever the app is next opened.
 *
 * iOS allows a background handler roughly 30s; staying well inside that leaves
 * room for the connect flow (GATT discovery, battery/firmware reads, subscriptions)
 * plus the buzz itself, without risking being force-terminated mid-write.
 */
const BACKGROUND_CONNECT_TIMEOUT_MS = 15000;
const BACKGROUND_CONNECT_POLL_MS = 250;

/**
 * Handles alerts pushed from the admin dashboard.
 *
 * The backend sends a data-only FCM message (deliberately — so the app controls
 * the haptic, rather than the OS just showing a banner):
 *
 *   { type: 'safewave_alert', notificationId, title, body }
 *
 * On receipt the band buzzes and the message is shown for acknowledgement.
 */
export const AlertService = {
  /**
   * notificationId of the alert we last buzzed for. The band's button-ack is
   * attributed to the most recent buzz, so we buzz for one alert at a time —
   * see buzzForCurrentAlert.
   */
  _buzzedFor: null as string | null,

  _unsubscribeNotifications: null as (() => void) | null,

  /**
   * Start listening for alerts written to Firestore.
   *
   * This is the delivery channel that works without a push token: the backend
   * writes the notification doc unconditionally, so an open app always sees it.
   * FCM is the complementary channel — it's what can wake a *closed* app, which
   * Firestore listeners cannot do.
   *
   * Both channels funnel into the same queue and dedupe on notificationId, so
   * an alert that arrives by both routes is only shown and buzzed once.
   */
  initialize: (userId: string): void => {
    AlertService.cleanup();

    AlertService._unsubscribeNotifications = FirestoreService.subscribeToNotifications(
      userId,
      (notifications) => {
        const store = useAlertStore.getState();

        for (const notification of notifications) {
          const notificationId = notification.id;
          if (!notificationId) continue;

          // Already acknowledged (possibly from another device, or before a
          // reinstall) — don't resurrect it and buzz the user again.
          //
          // acknowledgedAt is the source of truth, not the `acknowledged`
          // boolean: the acknowledgeNotification callable stamps the timestamp
          // but does not currently set the boolean, so guarding on the latter
          // alone re-enqueues every already-acked alert on each reload.
          if (notification.acknowledgedAt || notification.acknowledged) continue;

          // enqueue dedupes on notificationId, so an alert delivered by both
          // FCM and this listener only lands once.
          store
            .enqueue({
              notificationId,
              title: notification.title ?? 'Alert',
              body: notification.body ?? '',
              receivedAt: Date.now(),
            })
            .then(() => AlertService.buzzForCurrentAlert())
            .catch((error) => {
              console.error('[AlertService] Failed to queue notification:', error);
            });
        }
      }
    );

    console.log('[AlertService] Listening for alerts for user:', userId);
  },

  cleanup: (): void => {
    if (AlertService._unsubscribeNotifications) {
      AlertService._unsubscribeNotifications();
      AlertService._unsubscribeNotifications = null;
    }
  },

  /**
   * Single entry point for an incoming push, called from both the foreground
   * (onMessage) and background (setBackgroundMessageHandler) handlers.
   */
  handleRemoteMessage: async (
    message: FirebaseMessagingTypes.RemoteMessage
  ): Promise<void> => {
    const data = message.data ?? {};

    if (data.type !== ALERT_MESSAGE_TYPE) {
      return; // Not ours.
    }

    // FCM data values are always strings.
    const notificationId = typeof data.notificationId === 'string' ? data.notificationId : '';
    if (!notificationId) {
      console.warn('[AlertService] Alert missing notificationId, ignoring');
      return;
    }

    const alert: SafewaveAlert = {
      notificationId,
      title: typeof data.title === 'string' ? data.title : 'Alert',
      body: typeof data.body === 'string' ? data.body : '',
      receivedAt: Date.now(),
    };

    console.log('[AlertService] Alert received:', notificationId);

    // Persist before buzzing. If the process is killed mid-handling, the alert
    // still surfaces the next time the app opens.
    const store = useAlertStore.getState();
    await store.hydrate();
    await store.enqueue(alert);

    // On a background delivery the React tree never mounts, so nothing has
    // brought BLE up — connectedDevice is null and buzzForCurrentAlert would
    // simply defer, leaving the band silent until the user opens the app. That
    // defeats the alert. Bring the link up here and wait for it, bounded well
    // inside the ~30s iOS allows a background handler.
    //
    // If this connects, the connect flow fires onBandConnected(), which buzzes
    // after the settle delay — don't also buzz here, or the alert races the
    // band's firmware connect buzz. buzzForCurrentAlert is only needed for the
    // already-connected case, where no connect flow runs to trigger it.
    const wasConnected = !!useBluetoothStore.getState().connectedDevice;
    await AlertService._ensureBandConnected();

    if (wasConnected) {
      await AlertService.buzzForCurrentAlert();
    }
  },

  /**
   * Buzz the band for the alert at the head of the queue, if we haven't already.
   *
   * Only ever one alert at a time. The band's button-ack carries no reference to
   * what it acknowledges (it's a bare 0x01, attributed to the most recent buzz),
   * so buzzing for two alerts at once would let a single press acknowledge the
   * wrong one. A broadcast can easily deliver several alerts within seconds, so
   * this is a real case, not a theoretical one.
   */
  buzzForCurrentAlert: async (): Promise<void> => {
    const alert = useAlertStore.getState().current();

    if (!alert) {
      AlertService._buzzedFor = null;
      return;
    }
    if (AlertService._buzzedFor === alert.notificationId) {
      return; // Already buzzing for this one.
    }

    // Don't claim the alert as buzzed until the band is actually reachable.
    // A pushed alert routinely lands while BLE is still coming up (app cold
    // start, or a link that dropped), and vibrate() gives up *quietly* after
    // its reconnect window — it doesn't throw. Marking it buzzed here would
    // strand the alert un-buzzed forever. Instead, leave it unclaimed and let
    // onBandConnected() retry once the link is up.
    if (!useBluetoothStore.getState().connectedDevice) {
      console.log(
        '[AlertService] Band not connected yet — deferring buzz for',
        alert.notificationId
      );
      return;
    }

    AlertService._buzzedFor = alert.notificationId;

    // vibrate() self-heals a dropped link (reconnect + bounded wait + one retry).
    // Don't await it: the alert is already persisted and displayed.
    useBluetoothStore
      .getState()
      .vibrate(ALERT_VIBRATION)
      .catch((error) => {
        // Let a later connect retry it rather than swallowing the alert.
        AlertService._buzzedFor = null;
        console.log('[AlertService] Alert buzz failed:', error?.message ?? error);
      });
  },

  /**
   * The band just connected. If an alert is still waiting to be buzzed (it
   * arrived while the link was down), buzz it now.
   */
  /**
   * Bring the BLE link up, if it isn't already, and wait for it.
   *
   * Only does real work on a background delivery: in the foreground the store is
   * already initialized and connected, so this returns immediately.
   *
   * Gives up quietly on timeout. The alert is already persisted, so the buzz
   * still happens via onBandConnected() once the user opens the app — a late
   * buzz beats a background handler that iOS kills mid-connect.
   */
  _ensureBandConnected: async (): Promise<void> => {
    const bluetooth = useBluetoothStore.getState();
    if (bluetooth.connectedDevice) return;

    try {
      // initialize() sets permissions/bluetoothEnabled and, when both are ready,
      // calls autoConnect() itself. autoConnect() is a no-op unless state is
      // 'idle', so this won't fight a connect already in flight.
      await bluetooth.initialize();

      const deadline = Date.now() + BACKGROUND_CONNECT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (useBluetoothStore.getState().connectedDevice) {
          console.log('[AlertService] Band connected in background, buzzing');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, BACKGROUND_CONNECT_POLL_MS));
      }

      console.log('[AlertService] Band did not connect in background — alert will buzz on open');
    } catch (error: any) {
      console.log('[AlertService] Background connect failed:', error?.message ?? error);
    }
  },

  onBandConnected: (): void => {
    if (!useAlertStore.getState().current()) return;

    // The band plays its own connection-success buzz in firmware. The app can't
    // observe when that finishes, so firing a queued alert buzz the instant the
    // link comes up lands it on top of one already playing — the two overlap on
    // the wrist and the alert pattern is lost. Let the connect buzz clear first.
    setTimeout(() => {
      // Re-check: the link can drop again, or the alert can be acknowledged from
      // the popup, during the settle window.
      if (!useAlertStore.getState().current()) return;
      if (!useBluetoothStore.getState().connectedDevice) return;

      AlertService.buzzForCurrentAlert().catch(() => {});
    }, CONNECT_BUZZ_SETTLE_MS);
  },

  /**
   * A physical button press on the band. Returns true if it acknowledged an
   * admin alert, false if there was none pending (in which case the caller
   * should fall through to the phone-notification ack path).
   *
   * Admin alerts take priority over ordinary phone-notification buzzes: they're
   * a targeted safety alert, and the dashboard is waiting on the acknowledgement.
   */
  handleButtonAck: async (): Promise<boolean> => {
    const store = useAlertStore.getState();
    const alert = store.current();

    if (!alert) return false;

    await store.acknowledge(alert.notificationId, 'band');
    await AlertService.buzzForCurrentAlert(); // Buzz for the next one, if any.
    return true;
  },
};
