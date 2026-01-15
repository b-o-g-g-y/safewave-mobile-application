import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';

export const HomeScreen: React.FC = () => {
  const { user, userDocument, signOut } = useAuthStore();

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  return (
    <ImageBackground
      source={require('../../../assets/images/background.png')}
      style={styles.background}
      resizeMode="cover">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Logo size="small" />
          </View>

          {/* Welcome Section */}
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeText}>
              Welcome, {userDocument?.displayName || user?.displayName || 'User'}!
            </Text>
            <Text style={styles.emailText}>{user?.email}</Text>
          </View>

          {/* Status Card */}
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Connection Status</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, styles.statusDisconnected]} />
              <Text style={styles.statusText}>No device connected</Text>
            </View>
            <Text style={styles.statusHint}>
              Connect your Safewave Band to get started
            </Text>
          </View>

          {/* Placeholder for BLE functionality */}
          <View style={styles.actionsSection}>
            <Button
              title="Scan for Devices"
              onPress={() => Alert.alert('Coming Soon', 'BLE scanning will be implemented in the next stage')}
              style={styles.actionButton}
            />
          </View>

          {/* Sign Out */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleSignOut}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
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
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  welcomeSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emailText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  statusDisconnected: {
    backgroundColor: colors.error,
  },
  statusConnected: {
    backgroundColor: colors.success,
  },
  statusText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  statusHint: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  actionsSection: {
    flex: 1,
  },
  actionButton: {
    marginBottom: spacing.md,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  signOutText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '500',
  },
});
