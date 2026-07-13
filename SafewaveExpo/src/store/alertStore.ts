import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { AckSource, ALERT_ACK_VIBRATION, SafewaveAlert } from '../types/alert';
import { useBluetoothStore } from './bluetoothStore';

const STORAGE_KEY_PENDING_ALERTS = '@safewave/pending_alerts';

/**
 * Alerts that have been acknowledged locally but whose callable hasn't landed
 * yet (the user was offline). Kept out of `alerts` so the popup doesn't reappear,
 * but retried on the next foreground — dropping one would leave the dashboard
 * believing the user never saw the alert.
 */
const STORAGE_KEY_UNSENT_ACKS = '@safewave/unsent_acks';

interface AlertState {
  /** Pending alerts, oldest first. Only the head is shown and buzzed. */
  alerts: SafewaveAlert[];
  /** notificationId currently being acknowledged, if any. */
  ackInFlight: string | null;
  hydrated: boolean;
}

interface AlertActions {
  /** Restore alerts persisted by a previous session (or a background handler). */
  hydrate: () => Promise<void>;
  /** Queue a newly received alert. Deduped on notificationId. */
  enqueue: (alert: SafewaveAlert) => Promise<void>;
  /** Acknowledge an alert. Idempotent; safe to call from both routes at once. */
  acknowledge: (notificationId: string, source: AckSource) => Promise<void>;
  /** Retry any acks that failed to send while offline. */
  flushUnsentAcks: () => Promise<void>;
  /** The alert currently shown and buzzing, if any. */
  current: () => SafewaveAlert | undefined;
}

type AlertStore = AlertState & AlertActions;

const persistAlerts = async (alerts: SafewaveAlert[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_PENDING_ALERTS, JSON.stringify(alerts));
  } catch (error) {
    console.error('[Alert Store] Failed to persist alerts:', error);
  }
};

const readUnsentAcks = async (): Promise<string[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_UNSENT_ACKS);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

const writeUnsentAcks = async (ids: string[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_UNSENT_ACKS, JSON.stringify(ids));
  } catch (error) {
    console.error('[Alert Store] Failed to persist unsent acks:', error);
  }
};

/**
 * Tell the backend this user acknowledged this alert.
 *
 * Deliberately a callable, never a direct Firestore write: the function takes
 * the acknowledging user's identity from the auth context, which is what makes
 * the acknowledgement trustworthy. A client write would let anyone ack on
 * anyone's behalf.
 */
const callAcknowledgeNotification = async (notificationId: string): Promise<void> => {
  const callable = httpsCallable(getFunctions(), 'acknowledgeNotification');
  await callable({ notificationId });
};

export const useAlertStore = create<AlertStore>((set, get) => ({
  alerts: [],
  ackInFlight: null,
  hydrated: false,

  current: () => get().alerts[0],

  hydrate: async () => {
    if (get().hydrated) return;

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_PENDING_ALERTS);
      const alerts = raw ? (JSON.parse(raw) as SafewaveAlert[]) : [];
      set({ alerts, hydrated: true });
      if (alerts.length) {
        console.log(`[Alert Store] Restored ${alerts.length} pending alert(s)`);
      }
    } catch (error) {
      console.error('[Alert Store] Failed to hydrate:', error);
      set({ hydrated: true });
    }

    // An ack may have been stranded by going offline mid-acknowledge.
    await get().flushUnsentAcks();
  },

  enqueue: async (alert) => {
    const { alerts } = get();

    // FCM can deliver the same message twice, and a foreground/background
    // transition can run both handlers for one message.
    if (alerts.some((a) => a.notificationId === alert.notificationId)) {
      console.log('[Alert Store] Duplicate alert ignored:', alert.notificationId);
      return;
    }

    const next = [...alerts, alert];
    set({ alerts: next });
    await persistAlerts(next);
    console.log(
      `[Alert Store] Queued alert ${alert.notificationId} (${next.length} pending)`
    );
  },

  acknowledge: async (notificationId, source) => {
    const { alerts, ackInFlight } = get();

    if (ackInFlight === notificationId) {
      return; // Already acknowledging — e.g. a button press racing a popup tap.
    }
    if (!alerts.some((a) => a.notificationId === notificationId)) {
      return; // Already acknowledged and dequeued.
    }

    // Claim it before awaiting, so a second press can't double-send. Same idiom
    // as NotificationService.handleButtonAck.
    set({ ackInFlight: notificationId });

    // Stop the buzz and confirm the tap haptically. Only the popup route needs
    // this: a physical button press is already what stops the buzz in firmware.
    //
    // Skip it outright if the band isn't connected, rather than letting vibrate()
    // kick a reconnect and block for its wait window. This is a courtesy haptic on
    // a band the user isn't wearing or can't reach; it isn't worth forcing a
    // reconnect for, and doing so buzzes them the moment the link happens to come
    // back — long after the tap it was meant to confirm.
    if (source === 'popup' && useBluetoothStore.getState().connectedDevice) {
      useBluetoothStore
        .getState()
        .vibrate(ALERT_ACK_VIBRATION)
        .catch((error) => {
          console.log('[Alert Store] Ack buzz failed (non-fatal):', error?.message ?? error);
        });
    }

    // Dequeue optimistically: the user has acknowledged, so the popup should go
    // away now rather than hanging on a network round-trip they may not have.
    const remaining = get().alerts.filter((a) => a.notificationId !== notificationId);
    set({ alerts: remaining });
    await persistAlerts(remaining);

    try {
      await callAcknowledgeNotification(notificationId);
      console.log(`[Alert Store] Acknowledged ${notificationId} via ${source}`);
    } catch (error) {
      // Likely offline — which is exactly when a user most needs to acknowledge.
      // Keep it for retry rather than letting the dashboard believe they never saw it.
      console.error('[Alert Store] Ack callable failed, queued for retry:', error);
      const unsent = await readUnsentAcks();
      if (!unsent.includes(notificationId)) {
        await writeUnsentAcks([...unsent, notificationId]);
      }
    } finally {
      set({ ackInFlight: null });
    }
  },

  flushUnsentAcks: async () => {
    const unsent = await readUnsentAcks();
    if (!unsent.length) return;

    console.log(`[Alert Store] Retrying ${unsent.length} unsent ack(s)`);
    const stillUnsent: string[] = [];

    for (const notificationId of unsent) {
      try {
        await callAcknowledgeNotification(notificationId);
        console.log(`[Alert Store] Retried ack landed: ${notificationId}`);
      } catch {
        stillUnsent.push(notificationId);
      }
    }

    await writeUnsentAcks(stillUnsent);
  },
}));
