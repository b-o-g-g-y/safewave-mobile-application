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
import { AuthTabs } from '../../components/AuthTabs';
import { colors, spacing } from '../../theme/colors';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { useAuthStore } from '../../store/authStore';

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const { signInWithEmail, signInWithGoogle, signInWithApple, isLoading, error, clearError } = useAuthStore();

  const validateInputs = (): boolean => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return false;
    }
    if (!password) {
      Alert.alert('Error', 'Please enter your password');
      return false;
    }
    return true;
  };

  const handleLogin = async () => {
    if (!validateInputs()) return;
    
    clearError();
    try {
      await signInWithEmail({ email: email.trim(), password });
      // Navigation will be handled by auth state change in App.tsx
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'An error occurred');
    }
  };

  const handleGoogleLogin = async () => {
    clearError();
    try {
      await signInWithGoogle();
      // Navigation will be handled by auth state change in App.tsx
    } catch (err: any) {
      // Don't show alert for cancelled sign-in
      if (err.code !== 'google-signin/cancelled') {
        Alert.alert('Google Sign-In Failed', err.message || 'An error occurred');
      }
    }
  };

  const handleAppleLogin = async () => {
    clearError();
    try {
      await signInWithApple();
      // Navigation will be handled by auth state change in App.tsx
    } catch (err: any) {
      // Don't show alert for cancelled sign-in
      if (err.code !== 'apple-signin/cancelled') {
        Alert.alert('Apple Sign-In Failed', err.message || 'An error occurred');
      }
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
              <Logo size="large" />
            </View>

            {/* Auth Tabs */}
            <AuthTabs
              activeTab="signin"
              onTabChange={(tab) => {
                if (tab === 'signup') {
                  navigation.navigate('Signup');
                }
              }}
            />

            {/* Form Section */}
            <View style={styles.formSection}>
              <TextInput
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />

              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                isPassword
                editable={!isLoading}
              />

              <TouchableOpacity
                style={styles.forgotPassword}
                onPress={() => navigation.navigate('ForgotPassword')}
                disabled={isLoading}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>

              <Button
                title={isLoading ? '' : 'Login'}
                onPress={handleLogin}
                style={styles.loginButton}
                disabled={isLoading}>
                {isLoading && <ActivityIndicator color={colors.textPrimary} />}
              </Button>

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>Or Continue with</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Social Buttons */}
              <View style={styles.socialButtons}>
                <Button
                  title="Google"
                  variant="google"
                  icon={require('../../../assets/images/google-logo.png')}
                  onPress={handleGoogleLogin}
                  style={styles.socialButton}
                  disabled={isLoading}
                />
                {Platform.OS === 'ios' && (
                  <Button
                    title="Apple"
                    variant="apple"
                    icon={require('../../../assets/images/apple_logo.png')}
                    onPress={handleAppleLogin}
                    style={styles.socialButton}
                    disabled={isLoading}
                  />
                )}
              </View>
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
    marginBottom: spacing.xl,
  },
  formSection: {
    flex: 1,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: spacing.lg,
    marginTop: -spacing.sm,
  },
  forgotPasswordText: {
    color: colors.accent,
    fontSize: 14,
  },
  loginButton: {
    marginTop: spacing.sm,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.inputBorderInactive,
  },
  dividerText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginHorizontal: spacing.md,
  },
  socialButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  socialButton: {
    flex: 1,
  },
});
