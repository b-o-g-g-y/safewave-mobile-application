import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../../theme/colors';
import {
  PermissionsService,
  PermissionStatus,
} from '../../services/PermissionsService';

/**
 * Guided checklist that walks the user through every OS-level grant needed for
 * the band to stay connected and vibrate in the background on Android:
 *   1. Notifications (POST_NOTIFICATIONS)
 *   2. Battery-optimization exemption
 *   3. Notification-listener access
 *   4. OEM auto-start / protected-app (strict manufacturers only)
 *
 * Status is re-read whenever the screen regains focus (the user grants most of
 * these in system settings and returns), so rows flip to "done" automatically.
 *
 * Used in two ways:
 *   - As a one-time gate after login (onComplete provided) when grants are missing.
 *   - Standalone from the Account screen so users can re-verify later.
 */

interface PermissionsChecklistScreenProps {
  /** When provided, renders a "Continue" / "Skip" footer for the onboarding gate. */
  onComplete?: () => void;
}

interface ChecklistItem {
  key: keyof Omit<PermissionStatus, 'isStrictOEM'>;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  done: boolean;
  onAction: () => void | Promise<void>;
}

export const PermissionsChecklistScreen: React.FC<
  PermissionsChecklistScreenProps
> = ({ onComplete }) => {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  const refresh = useCallback(async () => {
    const next = await PermissionsService.getStatus();
    setStatus(next);
    setLoading(false);
  }, []);

  // Initial load.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-check when the user returns from a system settings screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (
        (appState.current === 'background' || appState.current === 'inactive') &&
        next === 'active'
      ) {
        refresh();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [refresh]);

  // Non-Android (or fully granted with no OEM step) has nothing to configure;
  // the onboarding gate should never land here, but guard anyway.
  if (Platform.OS !== 'android') {
    return null;
  }

  const items: ChecklistItem[] = status
    ? [
        {
          key: 'notifications',
          title: 'Allow notifications',
          description:
            'Lets the app show the ongoing "connected" notification that keeps it running in the background.',
          icon: 'notifications-outline',
          done: status.notifications,
          onAction: async () => {
            await PermissionsService.ensureNotifications();
            refresh();
          },
        },
        {
          key: 'batteryOptimization',
          title: 'Disable battery optimization',
          description:
            'Stops the system from putting the app to sleep, which would disconnect your band.',
          icon: 'battery-charging-outline',
          done: status.batteryOptimization,
          onAction: async () => {
            await PermissionsService.requestIgnoreBatteryOptimizations();
          },
        },
        {
          key: 'notificationListener',
          title: 'Grant notification access',
          description:
            'Lets the app detect notifications from your chosen apps and buzz your band.',
          icon: 'apps-outline',
          done: status.notificationListener,
          onAction: () => PermissionsService.openNotificationListenerSettings(),
        },
      ]
    : [];

  const allRequiredDone =
    !!status &&
    status.notifications &&
    status.batteryOptimization &&
    status.notificationListener;

  const content = (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="shield-checkmark" size={40} color={colors.accent} />
        </View>
        <Text style={styles.title}>Stay connected in the background</Text>
        <Text style={styles.subtitle}>
          For your band to receive alerts even when the app is closed, please
          grant the following. Each opens a system screen, then return here.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.accent}
          style={{ marginTop: spacing.xl }}
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <PermissionRow key={item.key} item={item} />
          ))}

          {status?.isStrictOEM && (
            <PermissionRow
              item={{
                key: 'notifications', // unused; OEM row has no boolean status
                title: 'Allow auto-start',
                description:
                  'Your phone brand can block apps from restarting. Find Safewave in the list and allow it to auto-start / run in the background.',
                icon: 'settings-outline',
                done: false,
                onAction: () => PermissionsService.openAutoStartSettings(),
              }}
              forceActionLabel="Open"
              neverDone
            />
          )}
        </View>
      )}
    </ScrollView>
  );

  if (!onComplete) {
    // Standalone (Account) mode.
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {content}
      </SafeAreaView>
    );
  }

  // Onboarding gate mode with a footer.
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {content}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, !allRequiredDone && styles.primaryButtonMuted]}
          onPress={onComplete}>
          <Text style={styles.primaryButtonText}>
            {allRequiredDone ? 'Continue' : 'Continue anyway'}
          </Text>
        </TouchableOpacity>
        {!allRequiredDone && (
          <Text style={styles.footerHint}>
            You can finish this later from Account → Background access.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
};

const PermissionRow: React.FC<{
  item: ChecklistItem;
  forceActionLabel?: string;
  neverDone?: boolean;
}> = ({ item, forceActionLabel, neverDone }) => {
  const done = !neverDone && item.done;
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, done && styles.rowIconDone]}>
        <Ionicons
          name={done ? 'checkmark' : item.icon}
          size={22}
          color={done ? colors.success : colors.accent}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowDescription}>{item.description}</Text>
      </View>
      {done ? (
        <View style={styles.doneBadge}>
          <Text style={styles.doneBadgeText}>Done</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => item.onAction()}>
          <Text style={styles.actionButtonText}>
            {forceActionLabel ?? 'Allow'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headerIcon: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.round,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowIconDone: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
  },
  rowText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  rowDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  actionButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  actionButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  doneBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  doneBadgeText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  primaryButtonMuted: {
    backgroundColor: colors.surfaceLight,
  },
  primaryButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  footerHint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
