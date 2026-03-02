import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import { BLEDevice } from '../types/bluetooth';

interface DeviceSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  devices: BLEDevice[];
  isScanning: boolean;
  onSelectDevice: (device: BLEDevice) => void;
  onStartScan: () => void;
  onStopScan: () => void;
  isConnecting: boolean;
  connectingDeviceId: string | null;
}

/**
 * Get signal strength indicator based on RSSI
 */
const getSignalStrength = (rssi: number | null): { bars: number; color: string } => {
  if (rssi === null) return { bars: 0, color: colors.textMuted };
  if (rssi >= -50) return { bars: 4, color: colors.success };
  if (rssi >= -60) return { bars: 3, color: colors.success };
  if (rssi >= -70) return { bars: 2, color: colors.warning };
  return { bars: 1, color: colors.error };
};

/**
 * Signal strength indicator component
 */
const SignalIndicator: React.FC<{ rssi: number | null }> = ({ rssi }) => {
  const { bars, color } = getSignalStrength(rssi);

  return (
    <View style={styles.signalContainer}>
      {[1, 2, 3, 4].map((level) => (
        <View
          key={level}
          style={[
            styles.signalBar,
            { height: 4 + level * 3 },
            level <= bars ? { backgroundColor: color } : { backgroundColor: colors.border },
          ]}
        />
      ))}
    </View>
  );
};

/**
 * Device list item component
 */
const DeviceItem: React.FC<{
  device: BLEDevice;
  onSelect: () => void;
  isConnecting: boolean;
}> = ({ device, onSelect, isConnecting }) => (
  <TouchableOpacity
    style={styles.deviceItem}
    onPress={onSelect}
    disabled={isConnecting}
    activeOpacity={0.7}>
    <View style={styles.deviceInfo}>
      <Text style={styles.deviceName}>
        {device.name || device.localName || 'Unknown Device'}
      </Text>
      <Text style={styles.deviceId}>{device.id}</Text>
    </View>
    <View style={styles.deviceActions}>
      <SignalIndicator rssi={device.rssi} />
      {isConnecting ? (
        <ActivityIndicator size="small" color={colors.accent} style={styles.connectingIndicator} />
      ) : (
        <Text style={styles.connectText}>Connect</Text>
      )}
    </View>
  </TouchableOpacity>
);

/**
 * Device selection modal for BLE device pairing
 */
export const DeviceSelectionModal: React.FC<DeviceSelectionModalProps> = ({
  visible,
  onClose,
  devices,
  isScanning,
  onSelectDevice,
  onStartScan,
  onStopScan,
  isConnecting,
  connectingDeviceId,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Select Device</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Scanning indicator */}
          {isScanning && (
            <View style={styles.scanningContainer}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.scanningText}>Scanning for devices...</Text>
            </View>
          )}

          {/* Device list */}
          {devices.length > 0 ? (
            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <DeviceItem
                  device={item}
                  onSelect={() => onSelectDevice(item)}
                  isConnecting={connectingDeviceId === item.id}
                />
              )}
              style={styles.deviceList}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {isScanning
                  ? 'Looking for Safewave Bands nearby...'
                  : 'No devices found. Tap Scan to search.'}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.scanButton, isScanning && styles.scanButtonActive]}
              onPress={isScanning ? onStopScan : onStartScan}
              disabled={isConnecting}>
              <Text style={styles.scanButtonText}>
                {isScanning ? 'Stop Scan' : 'Scan for Devices'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Help text */}
          <Text style={styles.helpText}>
            Make sure your Safewave Band is turned on and nearby.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.xs,
  },
  closeText: {
    fontSize: 28,
    color: colors.textSecondary,
    lineHeight: 28,
  },
  scanningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  scanningText: {
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    fontSize: 14,
  },
  deviceList: {
    maxHeight: 300,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  deviceId: {
    fontSize: 12,
    color: colors.textMuted,
  },
  deviceActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signalContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginRight: spacing.md,
    height: 16,
  },
  signalBar: {
    width: 4,
    marginHorizontal: 1,
    borderRadius: 1,
  },
  connectText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  connectingIndicator: {
    marginLeft: spacing.sm,
  },
  emptyContainer: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  actions: {
    paddingTop: spacing.lg,
  },
  scanButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.round,
    alignItems: 'center',
  },
  scanButtonActive: {
    backgroundColor: colors.error,
  },
  scanButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  helpText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
