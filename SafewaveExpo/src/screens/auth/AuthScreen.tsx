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
  Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Logo } from '../../components/Logo';
import { TextInput } from '../../components/TextInput';
import { Button } from '../../components/Button';
import { AuthTabs } from '../../components/AuthTabs';
import { colors, spacing } from '../../theme/colors';
import { AuthStackParamList } from '../../navigation/AuthNavigator';

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

  const handleLogin = () => {
    // TODO: Implement Firebase auth
    console.log('Login:', email, password);
  };

  const handleSignup = () => {
    // TODO: Implement Firebase auth signup
    if (signupPassword !== confirmPassword) {
      console.log('Passwords do not match');
      return;
    }
    console.log('Signup:', name, signupEmail, signupPassword);
    navigation.navigate('VerifyEmail', { email: signupEmail });
  };

  const handleGoogleAuth = () => {
    console.log('Google auth');
  };

  const handleAppleAuth = () => {
    console.log('Apple auth');
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
      />

      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        isPassword
      />

      <TouchableOpacity
        style={styles.forgotPassword}
        onPress={() => navigation.navigate('ForgotPassword')}>
        <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
      </TouchableOpacity>

      <Button title="Login" onPress={handleLogin} style={styles.submitButton} />
    </>
  );

  const renderSignUpForm = () => (
    <>
      <TextInput
        placeholder="Full Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />

      <TextInput
        placeholder="Email"
        value={signupEmail}
        onChangeText={setSignupEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextInput
        placeholder="Password"
        value={signupPassword}
        onChangeText={setSignupPassword}
        isPassword
      />

      <TextInput
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        isPassword
      />

      <Button
        title="Create Account"
        onPress={handleSignup}
        style={styles.submitButton}
      />
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
                />
                <Button
                  title="Apple"
                  variant="apple"
                  icon={require('../../../assets/images/apple_logo.png')}
                  onPress={handleAppleAuth}
                  style={styles.socialButton}
                />
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
