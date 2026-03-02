import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme/colors';
import { useBluetoothStore } from '../store/bluetoothStore';
import { useAuthStore } from '../store/authStore';
import { FirestoreService } from '../services/firebase/FirestoreService';

interface BandInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Band info modal showing device details and allowing admins to rename
 */
export const BandInfoModal: React.FC<BandInfoModalProps> = ({
  visible,
  onClose,
}) => {
  const { connectedDevice, batteryLevel, isCharging, firmwareVersion, renameBand } = useBluetoothStore();
  const { userDocument } = useAuthStore();

  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [showRenameConfirm, setShowRenameConfirm] = useState(false);

  // Check if user has admin privileges
  const isAdmin = userDocument?.role === 'super_admin' || userDocument?.role === 'org_admin';

  // Reset editing state when modal opens/closes
  useEffect(() => {
    if (visible) {
      setIsEditing(false);
      setNewName(connectedDevice?.name || 'Safewave Band');
    }
  }, [visible, connectedDevice?.name]);

  const handleStartEditing = () => {
    setNewName(connectedDevice?.name || 'Safewave Band');
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setNewName(connectedDevice?.name || 'Safewave Band');
  };

  const handleSaveRename = async () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Band name cannot be empty');
      return;
    }

    if (newName.trim() === connectedDevice?.name) {
      setIsEditing(false);
      return;
    }

    setShowRenameConfirm(true);
  };

  const handleConfirmRename = async () => {
    setIsRenaming(true);
    const oldName = connectedDevice?.name;
    const trimmedNewName = newName.trim();
    
    try {
      await renameBand(trimmedNewName);
    } catch (error: any) {
      // Band restarts after rename which causes disconnect - this is expected success
      const isDisconnectError = 
        error?.message?.includes('disconnected') || 
        error?.message?.includes('was disconnected') ||
        error?.message?.includes('Operation was cancelled');
      
      if (!isDisconnectError) {
        Alert.alert('Error', error.message || 'Failed to rename band');
        setIsRenaming(false);
        return;
      }
      console.log('[BandInfoModal] Band disconnected during rename (expected - band is restarting)');
    }
    
    // Update Firebase if band is registered in the organization
    if (oldName && userDocument?.organizationId) {
      try {
        await FirestoreService.updateBandName(
          oldName,
          trimmedNewName,
          userDocument.organizationId
        );
      } catch (firebaseError) {
        console.log('[BandInfoModal] Firebase update failed (band may not be registered):', firebaseError);
      }
    }
    
    setIsEditing(false);
    setShowRenameConfirm(false);
    setIsRenaming(false);
  };

  if (!connectedDevice) {
    return null;
  }

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
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Band Info</Text>
              <View style={styles.connectedBadge}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedText}>Connected</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Band Name Section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Band Name</Text>
            {isEditing ? (
              <View style={styles.editContainer}>
                <TextInput
                  style={styles.nameInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Enter band name"
                  placeholderTextColor={colors.placeholder}
                  maxLength={20}
                  autoFocus
                  editable={!isRenaming}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancelEditing}
                    disabled={isRenaming}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSaveRename}
                    disabled={isRenaming}>
                    {isRenaming ? (
                      <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.bandName}>
                  {connectedDevice.name || 'Safewave Band'}
                </Text>
                {isAdmin && (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={handleStartEditing}>
                    <Ionicons name="pencil" size={18} color={colors.accent} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Device ID */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Device ID</Text>
            <Text style={styles.sectionValue}>{connectedDevice.id}</Text>
          </View>

          {/* Info Grid */}
          <View style={styles.infoGrid}>
            {/* Firmware Version */}
            <View style={styles.infoCard}>
              <Ionicons name="hardware-chip-outline" size={24} color={colors.accent} />
              <Text style={styles.infoLabel}>Firmware</Text>
              <Text style={styles.infoValue}>
                {firmwareVersion || 'Unknown'}
              </Text>
            </View>

            {/* Battery */}
            <View style={styles.infoCard}>
              <Ionicons
                name={isCharging ? 'battery-charging' : 'battery-half'}
                size={24}
                color={
                  batteryLevel !== null && batteryLevel <= 20
                    ? colors.error
                    : colors.success
                }
              />
              <Text style={styles.infoLabel}>Battery</Text>
              <View style={styles.infoValueRow}>
                <Text style={styles.infoValue}>
                  {batteryLevel !== null ? `${batteryLevel.toFixed(0)}%` : '--'}
                </Text>
                {isCharging && (
                  <Ionicons
                    name="flash"
                    size={16}
                    color={colors.success}
                    style={styles.chargingIcon}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Admin Badge */}
          {isAdmin && (
            <View style={styles.adminNote}>
              <Ionicons name="shield-checkmark" size={16} color={colors.accent} />
              <Text style={styles.adminNoteText}>
                You have admin privileges to rename this band
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
      <Modal
        visible={showRenameConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameConfirm(false)}>
        <Pressable style={styles.confirmOverlay} onPress={() => setShowRenameConfirm(false)}>
          <Pressable style={styles.confirmContainer} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>Confirm Rename</Text>
            <Text style={styles.confirmText}>
              Please allow 1-2 minutes for the band name to be updated.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancel}
                onPress={() => setShowRenameConfirm(false)}
                disabled={isRenaming}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmConfirm}
                onPress={handleConfirmRename}
                disabled={isRenaming}>
                {isRenaming ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Text style={styles.confirmConfirmText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: spacing.xs,
  },
  connectedText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
  },
  closeButton: {
    padding: spacing.xs,
  },
  closeText: {
    fontSize: 28,
    color: colors.textSecondary,
    lineHeight: 28,
  },
  section: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  sectionValue: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bandName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  editButton: {
    padding: spacing.xs,
  },
  editContainer: {
    gap: spacing.md,
  },
  nameInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  cancelButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
    marginHorizontal: -spacing.xs,
  },
  infoCard: {
    width: '50%',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chargingIcon: {
    marginLeft: 4,
  },
  adminNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 170, 225, 0.1)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  adminNoteText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginLeft: spacing.sm,
    flex: 1,
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  confirmContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 340,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  confirmText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  confirmCancel: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  confirmCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  confirmConfirm: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 90,
    alignItems: 'center',
  },
  confirmConfirmText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});
