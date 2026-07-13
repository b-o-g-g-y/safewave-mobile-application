import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, borderRadius } from '../theme/colors';
import { useAlertStore } from '../store/alertStore';

/**
 * Shows an alert pushed from the admin dashboard and takes the user's
 * acknowledgement.
 *
 * Mounted once, globally, so an alert can surface over whatever screen the user
 * is on. Deliberately not dismissible by backdrop tap or Android back — this is
 * a safety alert, and the dashboard is waiting on an explicit acknowledgement.
 *
 * The band's physical button acknowledges the same alert (see
 * AlertService.handleButtonAck), so this can also disappear on its own without
 * the user touching the phone.
 */
export const AlertAckModal: React.FC = () => {
  const alerts = useAlertStore((state) => state.alerts);
  const ackInFlight = useAlertStore((state) => state.ackInFlight);
  const acknowledge = useAlertStore((state) => state.acknowledge);

  const [isAcknowledging, setIsAcknowledging] = useState(false);

  const alert = alerts[0];
  const pendingCount = alerts.length;

  const handleAcknowledge = async () => {
    if (!alert) return;
    setIsAcknowledging(true);
    try {
      await acknowledge(alert.notificationId, 'popup');
    } finally {
      setIsAcknowledging(false);
    }
  };

  const busy = isAcknowledging || ackInFlight === alert?.notificationId;

  return (
    <Modal
      visible={!!alert}
      transparent
      animationType="fade"
      // Safety alert: must be acknowledged, not dismissed.
      onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconWrapper}>
            <Ionicons name="warning" size={32} color={colors.warning} />
          </View>

          <Text style={styles.title}>{alert?.title}</Text>

          {!!alert?.body && <Text style={styles.body}>{alert.body}</Text>}

          {pendingCount > 1 && (
            <Text style={styles.queueHint}>
              1 of {pendingCount} alerts
            </Text>
          )}

          <TouchableOpacity
            style={styles.acknowledgeButton}
            onPress={handleAcknowledge}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Text style={styles.acknowledgeText}>Acknowledge</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.bandHint}>
            You can also press the button on your band.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  iconWrapper: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  queueHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  acknowledgeButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 48,
  },
  acknowledgeText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  bandHint: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
