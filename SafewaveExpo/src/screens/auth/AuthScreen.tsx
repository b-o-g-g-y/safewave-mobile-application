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

type AuthScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Auth'>;
};

export const AuthScreen: React.FC<AuthScreenProps> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');

  // Sign In state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Sign Up state
  const [name, setName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const {
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signInWithApple,
    isLoading,
    clearError,
  } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    if (!password) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    clearError();
    try {
      await signInWithEmail({ email: email.trim(), password });
      // App.tsx will handle showing the verification screen if needed
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'An error occurred');
    }
  };

  const handleSignup = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    if (!signupEmail.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    if (!signupPassword) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }
    if (signupPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    clearError();
    try {
      await signUpWithEmail({
        email: signupEmail.trim(),
        password: signupPassword,
        displayName: name.trim()
      });
      navigation.navigate('VerifyEmail', { email: signupEmail });
    } catch (err: any) {
      Alert.alert('Signup Failed', err.message || 'An error occurred');
    }
  };

  const handleGoogleAuth = async () => {
    clearError();
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err.code !== 'google-signin/cancelled') {
        Alert.alert('Google Sign-In Failed', err.message || 'An error occurred');
      }
    }
  };

  const handleAppleAuth = async () => {
    clearError();
    try {
      await signInWithApple();
    } catch (err: any) {
      if (err.code !== 'apple-signin/cancelled') {
        Alert.alert('Apple Sign-In Failed', err.message || 'An error occurred');
      }
    }
  };

  const renderSignInForm = () => (
    <>
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
        style={styles.submitButton}
        disabled={isLoading}
      >
        {isLoading && <ActivityIndicator color={colors.textPrimary} />}
      </Button>
    </>
  );

  const renderSignUpForm = () => (
    <>
      <TextInput
        placeholder="Full Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        editable={!isLoading}
      />

      <TextInput
        placeholder="Email"
        value={signupEmail}
        onChangeText={setSignupEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isLoading}
      />

      <TextInput
        placeholder="Password"
        value={signupPassword}
        onChangeText={setSignupPassword}
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
        style={styles.submitButton}
        disabled={isLoading}
      >
        {isLoading && <ActivityIndicator color={colors.textPrimary} />}
      </Button>
    </>
  );

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
            <AuthTabs activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Form Section */}
            <View style={styles.formSection}>
              {activeTab === 'signin' ? renderSignInForm() : renderSignUpForm()}

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
                  onPress={handleGoogleAuth}
                  style={styles.socialButton}
                  disabled={isLoading}
                />
                {Platform.OS === 'ios' && (
                  <Button
                    title="Apple"
                    variant="apple"
                    icon={require('../../../assets/images/apple_logo.png')}
                    onPress={handleAppleAuth}
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
  submitButton: {
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
