import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ImageBackground,
  Linking,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';
import { NotificationListenerService } from '../../services/NotificationListenerService';
import { EditProfileModal } from '../../components/EditProfileModal';
import { AccountStackParamList } from '../../navigation/AccountStackNavigator';

const PRIVACY_POLICY_URL = 'https://safewavetech.com/policies/privacy-policy';
const TERMS_OF_SERVICE_URL = 'https://safewavetech.com/policies/terms-of-service';
const ABOUT_URL = 'https://safewavetech.com/pages/about-us';

type AccountScreenNavigationProp = NativeStackNavigationProp<AccountStackParamList, 'AccountMain'>;

export const AccountScreen: React.FC = () => {
  const navigation = useNavigation<AccountScreenNavigationProp>();
  const { user, userDocument, signOut } = useAuthStore();
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [notificationSettingsVisible, setNotificationSettingsVisible] = useState(false);

  // Check if user has organization data
  const hasOrganization = Boolean(userDocument?.organizationId);
  const organizationId = userDocument?.organizationId || '';
  // User is admin if role is 'org_admin' or 'super_admin'
  const isAdmin = userDocument?.role === 'org_admin' || userDocument?.role === 'super_admin';
  const isAndroid = Platform.OS === 'android';

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to sign out');
          }
        },
      },
    ]);
  };

  const handleOpenURL = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Unable to open this link');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open link');
    }
  };

  const handleNotificationSettings = () => {
    setNotificationSettingsVisible(true);
  };

  const handleOpenNotificationSettings = () => {
    NotificationListenerService.openSettings();
    setNotificationSettingsVisible(false);
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
    <ImageBackground
      source={require('../../../assets/images/background.png')}
      style={styles.background}
      resizeMode="cover">
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Account</Text>
          </View>

          {/* Profile Card */}
          <View style={styles.profileCard}>
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

            {/* User Info with Edit Button */}
            <View style={styles.userInfoRow}>
              <View style={styles.userInfoText}>
                <Text style={styles.displayName}>{displayName}</Text>
                <Text style={styles.email}>{email}</Text>
              </View>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setEditProfileVisible(true)}>
                <Ionicons name="pencil" size={18} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {/* Organization - Only show if data exists */}
            {hasOrganization && (
              <View style={styles.orgContainer}>
                <Ionicons name="business-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.orgName}>{organizationId}</Text>
              </View>
            )}
          </View>

          {/* Menu Section */}
          <View style={styles.menuSection}>
            {/* Android Notification Access - Only show on Android */}
            {isAndroid && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleNotificationSettings}>
                <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>Notification Access</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.menuItem, !isAndroid && { borderTopWidth: 0 }]}
              onPress={() => navigation.navigate('HelpSupport')}>
              <Ionicons name="help-circle-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Help & Support</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={() => handleOpenURL(ABOUT_URL)}>
              <Ionicons name="information-circle-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>About</Text>
              <Ionicons name="open-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Legal Section */}
          <View style={styles.menuSection}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleOpenURL(PRIVACY_POLICY_URL)}>
              <Ionicons name="document-text-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Privacy Policy</Text>
              <Ionicons name="open-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={() => handleOpenURL(TERMS_OF_SERVICE_URL)}>
              <Ionicons name="document-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Terms of Service</Text>
              <Ionicons name="open-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Sign Out Button */}
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={22} color={colors.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={editProfileVisible}
        onClose={() => setEditProfileVisible(false)}
      />

      {/* Notification Settings Modal - Android Only */}
      {isAndroid && (
        <Modal
          visible={notificationSettingsVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setNotificationSettingsVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Notification Access</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setNotificationSettingsVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.iconContainer}>
                  <Ionicons name="notifications-outline" size={64} color={colors.accent} />
                </View>
                <Text style={styles.modalDescription}>
                  To receive alerts on your Safewave Band, you need to enable notification access for this app in your Android settings.
                </Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.openSettingsButton}
                  onPress={handleOpenNotificationSettings}>
                  <Text style={styles.openSettingsButtonText}>Open Settings</Text>
                  <Ionicons name="arrow-forward" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  header: {
    paddingVertical: spacing.lg,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
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
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  userInfoText: {
    alignItems: 'center',
    flex: 1,
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
  },
  editButton: {
    position: 'absolute',
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${colors.accent}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  orgName: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  menuSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
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
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
    marginLeft: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.xs,
  },
  modalBody: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: spacing.lg,
  },
  modalDescription: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalActions: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  openSettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accent,
    gap: spacing.xs,
  },
  openSettingsButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
