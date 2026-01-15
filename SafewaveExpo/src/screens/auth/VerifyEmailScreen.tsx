import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme/colors';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { useAuthStore } from '../../store/authStore';

type VerifyEmailScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'VerifyEmail'>;
  route: RouteProp<AuthStackParamList, 'VerifyEmail'>;
};

export const VerifyEmailScreen: React.FC<VerifyEmailScreenProps> = ({
  navigation,
  route,
}) => {
  const { email } = route.params;
  const [isResending, setIsResending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  
  const { sendEmailVerification, checkEmailVerification, user } = useAuthStore();

  // Check verification status periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      const isVerified = await checkEmailVerification();
      if (isVerified) {
        // User email is verified, navigation will be handled by App.tsx
        clearInterval(interval);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const handleResendEmail = async () => {
    setIsResending(true);
    try {
      await sendEmailVerification();
      Alert.alert('Success', 'Verification email has been resent');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to resend verification email');
    } finally {
      setIsResending(false);
    }
  };

  const handleContinue = async () => {
    setIsChecking(true);
    try {
      const isVerified = await checkEmailVerification();
      if (isVerified) {
        // Navigation will be handled by auth state change in App.tsx
        Alert.alert('Success', 'Your email has been verified!');
      } else {
        Alert.alert(
          'Not Verified',
          'Your email has not been verified yet. Please check your inbox and click the verification link.'
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to check verification status');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../../assets/images/background.png')}
      style={styles.background}
      resizeMode="cover">
      <View style={styles.container}>
        {/* Logo Section */}
        <View style={styles.logoSection}>
          <Logo size="medium" />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.icon}>📧</Text>
          <Text style={styles.title}>Verify Your Email</Text>
          <Text style={styles.description}>
            We've sent a verification email to:
          </Text>
          <Text style={styles.email}>{email}</Text>
          <Text style={styles.instructions}>
            Please check your inbox and click the verification link to activate
            your account.
          </Text>

          <Button
            title={isChecking ? '' : "I've Verified My Email"}
            onPress={handleContinue}
            style={styles.continueButton}
            disabled={isChecking || isResending}>
            {isChecking && <ActivityIndicator color={colors.textPrimary} />}
          </Button>

          <TouchableOpacity
            onPress={handleResendEmail}
            style={styles.resendContainer}
            disabled={isResending || isChecking}>
            {isResending ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <>
                <Text style={styles.resendText}>Didn't receive the email? </Text>
                <Text style={styles.resendLink}>Resend</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Back to Login Link */}
        <View style={styles.loginContainer}>
          <TouchableOpacity 
            onPress={() => navigation.navigate('Auth')}
            disabled={isResending || isChecking}>
            <Text style={styles.loginLink}>← Back to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + 20,
    paddingBottom: spacing.xl,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 80,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  email: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
    marginVertical: spacing.sm,
  },
  instructions: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  continueButton: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
  },
  resendText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  resendLink: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  loginContainer: {
    alignItems: 'center',
  },
  loginLink: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '500',
  },
});
