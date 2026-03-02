import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme/colors';
import { useAuthStore } from '../store/authStore';

interface AccountModalProps {
  visible: boolean;
  onClose: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  visible,
  onClose,
}) => {
  const { user, userDocument, signOut } = useAuthStore();

  // Mock data for UI development - will be replaced with real data
  const isAdmin = true; // TODO: Replace with real admin check
  const organizationName = 'Acme Corporation'; // TODO: Replace with real org name

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          onClose();
          try {
            await signOut();
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to sign out');
          }
        },
      },
    ]);
  };

  // Get initials from name or email
  const getInitials = (): string => {
    const name = userDocument?.displayName || user?.displayName || user?.email || '';
    if (!name) return '?';
    
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  const displayName = userDocument?.displayName || user?.displayName || 'User';
  const email = user?.email || '';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <SafeAreaView edges={['bottom']}>
                {/* Handle bar */}
                <View style={styles.handleBar} />

                {/* Close button */}
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>

                {/* Avatar */}
                <View style={styles.avatarContainer}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials()}</Text>
                  </View>
                  {isAdmin && (
                    <View style={styles.adminBadge}>
                      <Ionicons name="shield-checkmark" size={14} color={colors.textPrimary} />
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>

                {/* User Info */}
                <Text style={styles.displayName}>{displayName}</Text>
                <Text style={styles.email}>{email}</Text>

                {/* Organization */}
                <View style={styles.orgContainer}>
                  <Ionicons name="business-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.orgName}>{organizationName}</Text>
                </View>

                {/* Divider */}
                <View style={styles.divider} />

                {/* Menu Items */}
                <TouchableOpacity style={styles.menuItem}>
                  <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
                  <Text style={styles.menuItemText}>Settings</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem}>
                  <Ionicons name="help-circle-outline" size={22} color={colors.textPrimary} />
                  <Text style={styles.menuItemText}>Help & Support</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem}>
                  <Ionicons name="information-circle-outline" size={22} color={colors.textPrimary} />
                  <Text style={styles.menuItemText}>About</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>

                {/* Sign Out Button */}
                <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                  <Ionicons name="log-out-outline" size={22} color={colors.error} />
                  <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              </SafeAreaView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    minHeight: '50%',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: colors.textMuted,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: spacing.sm,
    zIndex: 1,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
    marginTop: spacing.sm,
  },
  adminBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginLeft: 4,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  email: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  orgContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  orgName: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    marginLeft: spacing.md,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
    marginLeft: spacing.sm,
  },
});
