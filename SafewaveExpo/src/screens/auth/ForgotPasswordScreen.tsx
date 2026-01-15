import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Logo } from '../../components/Logo';
import { TextInput } from '../../components/TextInput';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme/colors';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { useAuthStore } from '../../store/authStore';

type ForgotPasswordScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;
};

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({
  navigation,
}) => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const { sendPasswordResetEmail, clearError } = useAuthStore();

  const validateEmail = (): boolean => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return false;
    }
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return false;
    }
    return true;
  };

  const handleResetPassword = async () => {
    if (!validateEmail()) return;
    
    clearError();
    setIsSending(true);
    
    try {
      await sendPasswordResetEmail(email.trim());
      setIsSubmitted(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send reset email');
    } finally {
      setIsSending(false);
    }
  };

  const handleResendEmail = async () => {
    setIsSending(true);
    try {
      await sendPasswordResetEmail(email.trim());
      Alert.alert('Success', 'Password reset email has been resent');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to resend email');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../../assets/images/background.png')}
      style={styles.background}
      resizeMode="cover">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.container}>
            {/* Logo Section */}
            <View style={styles.logoSection}>
              <Logo size="medium" />
            </View>

            {/* Title */}
            <Text style={styles.title}>Reset Password</Text>

            {!isSubmitted ? (
              <>
                {/* Description */}
                <Text style={styles.description}>
                  Enter your email address and we'll send you a link to reset
                  your password.
                </Text>

                {/* Form Section */}
                <View style={styles.formSection}>
                  <TextInput
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSending}
                  />

                  <Button
                    title={isSending ? '' : 'Send Reset Link'}
                    onPress={handleResetPassword}
                    style={styles.resetButton}
                    disabled={isSending}>
                    {isSending && <ActivityIndicator color={colors.textPrimary} />}
                  </Button>
                </View>
              </>
            ) : (
              <>
                {/* Success Message */}
                <View style={styles.successContainer}>
                  <Text style={styles.successIcon}>✉️</Text>
                  <Text style={styles.successTitle}>Check Your Email</Text>
                  <Text style={styles.successMessage}>
                    We've sent a password reset link to {email}. Please check
                    your inbox and follow the instructions.
                  </Text>
                  <Button
                    title={isSending ? '' : 'Resend Email'}
                    onPress={handleResendEmail}
                    style={styles.resendButton}
                    disabled={isSending}>
                    {isSending && <ActivityIndicator color={colors.textPrimary} />}
                  </Button>
                </View>
              </>
            )}

            {/* Back to Login Link */}
            <View style={styles.loginContainer}>
              <TouchableOpacity onPress={() => navigation.navigate('Auth')} disabled={isSending}>
                <Text style={styles.loginLink}>← Back to Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + 20,
    paddingBottom: spacing.xl,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  formSection: {
    flex: 1,
  },
  resetButton: {
    marginTop: spacing.md,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  successIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  successMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  resendButton: {
    width: '100%',
  },
  loginContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  loginLink: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '500',
  },
});
