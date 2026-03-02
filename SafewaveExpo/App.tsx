import React, { useEffect, useState, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Alert, AppState, AppStateStatus, Platform } from 'react-native';
import { AuthNavigator } from './src/navigation/AuthNavigator';
import { MainTabNavigator } from './src/navigation/MainTabNavigator';
import { useAuthStore } from './src/store/authStore';
import { useBluetoothStore } from './src/store/bluetoothStore';
import { NotificationService } from './src/services/NotificationService';
import { NotificationListenerService } from './src/services/NotificationListenerService';
import { ActivityLogService } from './src/services/ActivityLogService';
import { AppPresenceService } from './src/services/AppPresenceService';
import { BLEManager } from './src/services/bluetooth/BLEManager';
import { colors, spacing } from './src/theme/colors';

// Loading screen component
const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={colors.accent} />
  </View>
);

// Email verification screen component
const EmailVerificationScreen = () => {
  const { user, sendEmailVerification, checkEmailVerification, signOut } = useAuthStore();
  const [isResending, setIsResending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const handleResendEmail = async () => {
    setIsResending(true);
    try {
      await sendEmailVerification();
      Alert.alert('Email Sent', 'A new verification email has been sent to your inbox.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send verification email');
    } finally {
      setIsResending(false);
    }
  };

  const handleCheckVerification = async () => {
    setIsChecking(true);
    try {
      const isVerified = await checkEmailVerification();
      if (!isVerified) {
        Alert.alert('Not Verified', 'Your email is not verified yet. Please check your inbox and click the verification link.');
      }
      // If verified, the auth state will update and navigate automatically
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to check verification status');
    } finally {
      setIsChecking(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to sign out');
    }
  };

  return (
    <View style={styles.verificationContainer}>
      <View style={styles.verificationContent}>
        <Text style={styles.verificationIcon}>✉️</Text>
        <Text style={styles.verificationTitle}>Verify Your Email</Text>
        <Text style={styles.verificationMessage}>
          We've sent a verification email to:
        </Text>
        <Text style={styles.verificationEmail}>{user?.email}</Text>
        <Text style={styles.verificationSubtext}>
          Please check your inbox and click the verification link to continue.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleCheckVerification}
          disabled={isChecking}>
          {isChecking ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>I've Verified My Email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleResendEmail}
          disabled={isResending}>
          {isResending ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.secondaryButtonText}>Resend Verification Email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={handleSignOut}>
          <Text style={styles.linkButtonText}>Sign out and use a different account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Main app content with auth state handling
const AppContent = () => {
  const { isAuthenticated, isLoading, user, initialize } = useAuthStore();
  const appState = useRef(AppState.currentState);

  // Initialize auth state listener on mount
  useEffect(() => {
    const unsubscribe = initialize();
    return () => unsubscribe();
  }, []);

  // Initialize/cleanup NotificationService based on auth state
  useEffect(() => {
    if (isAuthenticated && user?.uid) {
      NotificationService.initialize(user.uid);
    } else {
      NotificationService.cleanup();
    }

    return () => {
      NotificationService.cleanup();
    };
  }, [isAuthenticated, user?.uid]);

  // Initialize/cleanup NotificationListenerService for Android
  useEffect(() => {
    if (Platform.OS === 'android' && isAuthenticated && user?.uid) {
      NotificationListenerService.initialize(user.uid);
      // The banners on Home and Alerts screens will guide users to enable permission
    } else if (Platform.OS === 'android') {
      NotificationListenerService.cleanup();
    }

    return () => {
      if (Platform.OS === 'android') {
        NotificationListenerService.cleanup();
      }
    };
  }, [isAuthenticated, user?.uid]);

  // Initialize/cleanup AppPresenceService for real-time app status tracking
  useEffect(() => {
    if (isAuthenticated && user?.uid) {
      AppPresenceService.initialize(user.uid);
    } else {
      AppPresenceService.cleanup();
    }

    return () => {
      AppPresenceService.cleanup();
    };
  }, [isAuthenticated, user?.uid]);

  // Listen for app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // Track app state changes but don't stop background services
      if (
        appState.current === 'active' &&
        (nextAppState === 'background' || nextAppState === 'inactive')
      ) {
        console.log('[App] App went to background, continuing background services');
        // Heartbeats and Bluetooth continue in background
      }
      
      // App came back to foreground
      if (
        (appState.current === 'background' || appState.current === 'inactive') &&
        nextAppState === 'active'
      ) {
        console.log('[App] App came to foreground');
        // Read battery/firmware if stably connected (skipped during background reconnections).
        // Only fire when already connected — not when connecting/reconnecting, to avoid
        // racing with the connect flow's own reads.
        const bleStore = useBluetoothStore.getState();
        if (bleStore.connectionState === 'connected' && bleStore.connectedDevice) {
          // Small delay to let any in-flight connect settle before issuing GATT reads
          setTimeout(() => {
            const current = useBluetoothStore.getState();
            if (current.connectionState !== 'connected') return;
            BLEManager.readBattery().then((status) => {
              if (status && useBluetoothStore.getState().connectionState === 'connected') {
                useBluetoothStore.setState({
                  batteryLevel: status.level,
                  isCharging: status.isCharging,
                });
              }
            }).catch(() => {});
            current.readFirmwareVersion().catch(() => {});
          }, 2000);
        }
      }
      
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  // Show loading screen while checking auth state
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Check if user needs email verification (only for email/password sign-in)
  // Social auth providers (Google, Apple) don't require email verification
  const needsEmailVerification = 
    isAuthenticated && 
    user && 
    !user.emailVerified && 
    user.email && 
    // Only require verification for email/password users
    // Google and Apple users are considered verified
    !user.photoURL; // Social users typically have a photoURL

  // Show email verification screen if authenticated but email not verified
  if (needsEmailVerification) {
    return <EmailVerificationScreen />;
  }

  // Show auth screens if not authenticated
  if (!isAuthenticated) {
    return <AuthNavigator />;
  }

  // Show main tab navigator for authenticated users
  return <MainTabNavigator />;
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <AppContent />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  verificationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
  },
  verificationContent: {
    alignItems: 'center',
    maxWidth: 320,
  },
  verificationIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  verificationTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  verificationMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  verificationEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  verificationSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.md,
    minHeight: 50,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.lg,
    minHeight: 50,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    paddingVertical: spacing.sm,
  },
  linkButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
