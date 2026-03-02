import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme/colors';
import { useAuthStore } from '../store/authStore';
import { AuthService } from '../services/firebase/AuthService';

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  visible,
  onClose,
}) => {
  const { user, userDocument } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  useEffect(() => {
    if (visible) {
      setDisplayName(userDocument?.displayName || user?.displayName || '');
      setResetEmailSent(false);
    }
  }, [visible, userDocument, user]);

  const handleUpdateProfile = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Please enter a display name');
      return;
    }

    setIsUpdating(true);
    try {
      await AuthService.updateProfile({ displayName: displayName.trim() });
      Alert.alert('Success', 'Profile updated successfully');
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePasswordReset = async () => {
    const email = user?.email;
    if (!email) {
      Alert.alert('Error', 'No email address associated with this account');
      return;
    }

    setIsSendingReset(true);
    try {
      await AuthService.sendPasswordResetEmail(email);
      setResetEmailSent(true);
      Alert.alert(
        'Email Sent',
        'Check your email for a link to reset your password.'
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send password reset email');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleResendPasswordReset = async () => {
    const email = user?.email;
    if (!email) return;

    setIsSendingReset(true);
    try {
      await AuthService.sendPasswordResetEmail(email);
      Alert.alert('Success', 'Password reset email has been resent');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resend password reset email');
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <SafeAreaView edges={['bottom']}>
                  {/* Handle bar */}
                  <View style={styles.handleBar} />

                  {/* Close button */}
                  <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={styles.title}>Edit Profile</Text>

                    {/* Display Name Input */}
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Display Name</Text>
                      <TextInput
                        style={styles.input}
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder="Enter your name"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="words"
                      />
                    </View>

                    {/* Email (Read-only) */}
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Email</Text>
                      <View style={styles.emailContainer}>
                        <Text style={styles.emailText}>{user?.email || ''}</Text>
                        <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
                      </View>
                    </View>

                    {/* Update Button */}
                    <TouchableOpacity
                      style={[styles.updateButton, isUpdating && styles.buttonDisabled]}
                      onPress={handleUpdateProfile}
                      disabled={isUpdating}>
                      {isUpdating ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <Text style={styles.updateButtonText}>Save Changes</Text>
                      )}
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Password Reset Section */}
                    <Text style={styles.sectionTitle}>Password</Text>
                    <Text style={styles.sectionDescription}>
                      Need to change your password? We'll send you an email with a reset link.
                    </Text>

                    <TouchableOpacity
                      style={[styles.resetButton, isSendingReset && styles.buttonDisabled]}
                      onPress={handlePasswordReset}
                      disabled={isSendingReset}>
                      {isSendingReset ? (
                        <ActivityIndicator color={colors.error} />
                      ) : (
                        <>
                          <Ionicons name="mail-outline" size={20} color={colors.error} />
                          <Text style={styles.resetButtonText}>Send Password Reset Email</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Resend Link - shown after email is sent */}
                    {resetEmailSent && (
                      <TouchableOpacity
                        onPress={handleResendPasswordReset}
                        style={styles.resendContainer}
                        disabled={isSendingReset}>
                        {isSendingReset ? (
                          <ActivityIndicator color={colors.accent} size="small" />
                        ) : (
                          <>
                            <Text style={styles.resendText}>Didn't receive the email? </Text>
                            <Text style={styles.resendLink}>Resend</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </SafeAreaView>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
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
  keyboardView: {
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    maxHeight: '80%',
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
  },
  emailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    opacity: 0.7,
  },
  emailText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  updateButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.error,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
    marginLeft: spacing.sm,
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
    marginTop: spacing.md,
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
});
