import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ImageBackground,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../../theme/colors';
import { useBluetoothStore } from '../../store/bluetoothStore';
import {
  FirmwareRepository,
  FirmwareManifest,
} from '../../services/firmware/FirmwareRepository';
import { OTAPhaseLabel } from '../../types/bluetooth';
import { compareFirmwareVersions } from '../../utils/firmwareVersion';

const PHASE_LABEL: Record<OTAPhaseLabel, string> = {
  preparing: 'Preparing…',
  handshake: 'Handshake with band…',
  'negotiating-mtu': 'Negotiating connection…',
  erasing: 'Erasing flash…',
  'writing-firmware': 'Flashing firmware…',
  finalising: 'Finalising…',
  rebooting: 'Rebooting band…',
  done: 'Done',
};

export const FirmwareUpdateScreen: React.FC = () => {
  const navigation = useNavigation();
  const {
    connectionState,
    batteryLevel,
    firmwareVersion,
    otaStatus,
    otaPhase,
    otaProgress,
    otaError,
    otaDeviceType,
    startOTA,
    cancelOTA,
    resetOTA,
    readFirmwareVersion,
    checkFirmwareUpdate,
  } = useBluetoothStore();

  const [manifest, setManifest] = useState<FirmwareManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const isConnected = connectionState === 'connected';
  const batteryOk = batteryLevel !== null && batteryLevel >= 40;
  const isRunning = otaStatus === 'running';
  const isFinished = otaStatus === 'success';

  // Strict version comparison: only allow flashing when the manifest
  // advertises a strictly newer version than what the band reports.
  // Returns null when either string is unparseable — treat as "unknown"
  // and don't enable the button, to avoid accidental downgrades.
  const versionCmp = compareFirmwareVersions(
    firmwareVersion,
    manifest?.version ?? null
  );
  const isNewer = versionCmp === -1;
  const isUpToDate = versionCmp === 0;
  const isOlderManifest = versionCmp === 1;

  const canStart =
    isConnected &&
    batteryOk &&
    !isRunning &&
    !isChecking &&
    !isDownloading &&
    !!manifest?.updateAvailable &&
    isNewer;

  useEffect(() => {
    if (isConnected && !firmwareVersion) {
      readFirmwareVersion().catch(() => {});
    }
  }, [isConnected, firmwareVersion, readFirmwareVersion]);

  const checkForUpdate = useCallback(async () => {
    setIsChecking(true);
    setManifestError(null);
    try {
      const m = await FirmwareRepository.getManifest();
      setManifest(m);
      // Refresh the store-level flag so the tab / account badges stay
      // in sync with what this screen is showing.
      await checkFirmwareUpdate();
    } catch (err: any) {
      setManifestError(err?.message || 'Failed to check for updates');
    } finally {
      setIsChecking(false);
    }
  }, [checkFirmwareUpdate]);

  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  const handleUpdate = useCallback(async () => {
    if (!manifest) return;

    if (otaDeviceType === 'BK8010H' || manifest.version) {
      // Secondary confirmation — bricking risk applies to all devices if
      // battery dies mid-flash, and specifically to BK8010H if interrupted.
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Start firmware update?',
          'Keep the band within Bluetooth range and charged until the update finishes. Do not close the app or turn off the band during the update.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Start update', style: 'destructive', onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirmed) return;
    }

    setIsDownloading(true);
    try {
      const bytes = await FirmwareRepository.fetchFirmwareBytes(manifest);
      setIsDownloading(false);
      await startOTA(bytes);
    } catch (err: any) {
      setIsDownloading(false);
      Alert.alert('Update failed', err?.message || 'OTA failed');
    }
  }, [manifest, otaDeviceType, startOTA]);

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Cancel update?',
      'The band will stay on its current firmware. You can try again later.',
      [
        { text: 'Keep updating', style: 'cancel' },
        { text: 'Cancel update', style: 'destructive', onPress: cancelOTA },
      ]
    );
  }, [cancelOTA]);

  const statusLine = useMemo(() => {
    if (otaStatus === 'idle') return null;
    if (otaStatus === 'error') return otaError || 'Update failed';
    if (otaStatus === 'success') return 'Update complete — band is rebooting';
    return otaPhase ? PHASE_LABEL[otaPhase] : 'Starting…';
  }, [otaStatus, otaError, otaPhase]);

  const progressPercent = Math.round(otaProgress * 100);

  return (
    <ImageBackground
      source={require('../../../assets/images/background.png')}
      style={styles.background}
      resizeMode="cover">
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              disabled={isRunning}
              onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Firmware Update</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="hardware-chip-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.rowLabel}>Band status</Text>
              <Text style={[styles.rowValue, !isConnected && { color: colors.error }]}>
                {isConnected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
            <View style={styles.row}>
              <Ionicons name="battery-half-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.rowLabel}>Battery</Text>
              <Text
                style={[
                  styles.rowValue,
                  batteryLevel !== null && !batteryOk && { color: colors.error },
                ]}>
                {batteryLevel !== null ? `${batteryLevel}%` : '—'}
              </Text>
            </View>
            <View style={styles.row}>
              <Ionicons name="git-branch-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.rowLabel}>Current version</Text>
              <Text style={styles.rowValue}>{firmwareVersion || '—'}</Text>
            </View>
            <View style={[styles.row, styles.rowLast]}>
              <Ionicons name="cloud-download-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.rowLabel}>Latest version</Text>
              <Text style={styles.rowValue}>
                {isChecking ? 'Checking…' : manifest?.version || '—'}
              </Text>
            </View>
          </View>

          {manifestError && (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={20} color={colors.error} />
              <Text style={styles.errorText}>{manifestError}</Text>
            </View>
          )}

          {manifest && isUpToDate && otaStatus === 'idle' && (
            <View style={styles.infoCard}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Text style={styles.infoText}>Your band is running the latest firmware.</Text>
            </View>
          )}

          {manifest && isOlderManifest && otaStatus === 'idle' && (
            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={22} color={colors.accent} />
              <Text style={styles.infoText}>
                Your band is on a newer firmware than the published release.
                No update needed.
              </Text>
            </View>
          )}

          {manifest && !manifest.updateAvailable && isNewer && otaStatus === 'idle' && (
            <View style={styles.infoCard}>
              <Ionicons name="time-outline" size={22} color={colors.textSecondary} />
              <Text style={styles.infoText}>
                A newer firmware exists but rollout is paused. Check back later.
              </Text>
            </View>
          )}

          {!batteryOk && isConnected && (
            <View style={styles.warningCard}>
              <Ionicons name="warning" size={22} color={colors.warning} />
              <Text style={styles.warningText}>
                Band battery must be at least 40% before starting an update.
                Charge the band and try again.
              </Text>
            </View>
          )}

          {isRunning && (
            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={22} color={colors.accent} />
              <Text style={styles.infoText}>
                Keep the app open and the band within Bluetooth range until
                the update finishes. The band will reboot on its own when
                done. You can cancel safely — the band will stay on the
                current firmware.
              </Text>
            </View>
          )}

          {(isRunning || isFinished || otaStatus === 'error') && (
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>{statusLine}</Text>
                {isRunning && (
                  <Text style={styles.progressPercent}>{progressPercent}%</Text>
                )}
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progressPercent}%` },
                    otaStatus === 'error' && { backgroundColor: colors.error },
                    otaStatus === 'success' && { backgroundColor: colors.success },
                  ]}
                />
              </View>
            </View>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.secondaryButton, (isChecking || isRunning) && styles.buttonDisabled]}
              disabled={isChecking || isRunning}
              onPress={checkForUpdate}>
              {isChecking ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <Text style={styles.secondaryButtonText}>Check for update</Text>
              )}
            </TouchableOpacity>

            {isRunning ? (
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.primaryButton, !canStart && styles.buttonDisabled]}
                disabled={!canStart}
                onPress={handleUpdate}>
                {isDownloading ? (
                  <ActivityIndicator color={colors.textPrimary} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {isFinished ? 'Done' : 'Update now'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {(isFinished || otaStatus === 'error') && (
            <TouchableOpacity style={styles.resetLink} onPress={resetOTA}>
              <Text style={styles.resetLinkText}>Reset status</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  backButton: { padding: spacing.xs },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSpacer: { width: 32 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: {
    flex: 1,
    marginLeft: spacing.md,
    fontSize: 15,
    color: colors.textSecondary,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: colors.error,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  progressLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  progressPercent: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
  },
  progressTrack: {
    height: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.round,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.round,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.error,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  resetLink: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  resetLinkText: {
    fontSize: 14,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
