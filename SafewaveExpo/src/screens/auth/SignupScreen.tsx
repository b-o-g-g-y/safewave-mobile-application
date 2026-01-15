import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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

type SignupScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Signup'>;
};

export const SignupScreen: React.FC<SignupScreenProps> = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const { signUpWithEmail, signInWithGoogle, signInWithApple, isLoading, clearError } = useAuthStore();

  const validateInputs = (): boolean => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return false;
    }
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return false;
    }
    if (!password) {
      Alert.alert('Error', 'Please enter a password');
      return false;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return false;
    }
    return true;
  };

  const handleSignup = async () => {
    if (!validateInputs()) return;
    
    clearError();
    try {
      await signUpWithEmail({
        email: email.trim(),
        password,
        displayName: name.trim(),
      });
      // Navigate to verify email screen
      navigation.navigate('VerifyEmail', { email: email.trim() });
    } catch (err: any) {
      Alert.alert('Sign Up Failed', err.message || 'An error occurred');
    }
  };

  const handleGoogleSignup = async () => {
    clearError();
    try {
      await signInWithGoogle();
      // Navigation will be handled by auth state change in App.tsx
    } catch (err: any) {
      if (err.code !== 'google-signin/cancelled') {
        Alert.alert('Google Sign-In Failed', err.message || 'An error occurred');
      }
    }
  };

  const handleAppleSignup = async () => {
    clearError();
    try {
      await signInWithApple();
      // Navigation will be handled by auth state change in App.tsx
    } catch (err: any) {
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
              activeTab="signup"
              onTabChange={(tab) => {
                if (tab === 'signin') {
                  navigation.navigate('Login');
                }
              }}
            />

            {/* Form Section */}
            <View style={styles.formSection}>
              <TextInput
                placeholder="Full Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!isLoading}
              />

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

              <TextInput
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                isPassword
                editable={!isLoading}
              />

              <Button
                title={isLoading ? '' : 'Create Account'}
                onPress={handleSignup}
                style={styles.signupButton}
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
                  onPress={handleGoogleSignup}
                  style={styles.socialButton}
                  disabled={isLoading}
                />
                {Platform.OS === 'ios' && (
                  <Button
                    title="Apple"
                    variant="apple"
                    icon={require('../../../assets/images/apple_logo.png')}
                    onPress={handleAppleSignup}
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
  signupButton: {
    marginTop: spacing.md,
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
