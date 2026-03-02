import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme/colors';
import { useBluetoothStore } from '../store/bluetoothStore';
import { VibrationCommand } from '../types/bluetooth';

// Simple Stepper Component (replaces native Slider)
interface StepperProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
}

const Stepper: React.FC<StepperProps> = ({ value, min, max, step, onValueChange }) => {
  const decrement = () => {
    if (value - step >= min) {
      onValueChange(value - step);
    }
  };

  const increment = () => {
    if (value + step <= max) {
      onValueChange(value + step);
    }
  };

  return (
    <View style={stepperStyles.container}>
      <TouchableOpacity
        style={[stepperStyles.button, value <= min && stepperStyles.buttonDisabled]}
        onPress={decrement}
        disabled={value <= min}
      >
        <Ionicons name="remove" size={24} color={value <= min ? colors.textMuted : colors.textPrimary} />
      </TouchableOpacity>

      <View style={stepperStyles.track}>
        <View
          style={[
            stepperStyles.fill,
            { width: `${((value - min) / (max - min)) * 100}%` }
          ]}
        />
      </View>

      <TouchableOpacity
        style={[stepperStyles.button, value >= max && stepperStyles.buttonDisabled]}
        onPress={increment}
        disabled={value >= max}
      >
        <Ionicons name="add" size={24} color={value >= max ? colors.textMuted : colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
};

const stepperStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  track: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: 4,
    marginHorizontal: spacing.md,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
});

interface VibrationConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (vibrations: number, strength: number) => void | Promise<void>;
  appName: string;
  initialVibrations?: number;
  initialStrength?: number;
}

export const VibrationConfigModal: React.FC<VibrationConfigModalProps> = ({
  visible,
  onClose,
  onSave,
  appName,
  initialVibrations = 2,
  initialStrength = 50,
}) => {
  const [vibrations, setVibrations] = useState(initialVibrations);
  const [strength, setStrength] = useState(initialStrength);
  const [isSaving, setIsSaving] = useState(false);
  const { vibrate, connectionState } = useBluetoothStore();

  // Reset values when modal opens with new initial values
  useEffect(() => {
    if (visible) {
      setVibrations(initialVibrations);
      setStrength(initialStrength);
      setIsSaving(false);
    }
  }, [visible, initialVibrations, initialStrength]);

  const handleTestVibration = async () => {
    // Check if band is connected
    if (connectionState !== 'connected') {
      Alert.alert(
        'Not Connected',
        'Please connect to your Safewave Band first to test vibrations.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      // Create vibration command with current settings
      const vibrationCommand: VibrationCommand = {
        strength: strength,
        numBuzzes: vibrations,
        dutyOfBuzz: 50, // Default duty cycle
        durationOfDelay: 50, // Default delay between buzzes
      };

      await vibrate(vibrationCommand);
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.message || 'Failed to send test vibration to band.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(vibrations, strength);
    } catch (error) {
      console.error('Error saving configuration:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Get strength label
  const getStrengthLabel = (value: number): string => {
    if (value <= 25) return 'Light';
    if (value <= 50) return 'Medium';
    if (value <= 75) return 'Strong';
    return 'Maximum';
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={isSaving ? undefined : onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <SafeAreaView edges={['bottom']}>
                {/* Handle bar */}
                <View style={styles.handleBar} />

                {/* Header */}
                <View style={styles.header}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={onClose}
                    disabled={isSaving}
                  >
                    <Text style={[styles.cancelText, isSaving && styles.disabledText]}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>Configure</Text>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Text style={styles.saveText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* App Name */}
                <Text style={styles.appName}>{appName}</Text>

                {/* Vibration Count */}
                <View style={styles.configSection}>
                  <View style={styles.configHeader}>
                    <View style={styles.configLabelRow}>
                      <Ionicons name="pulse" size={20} color={colors.accent} />
                      <Text style={styles.configLabel}>Number of Vibrations</Text>
                    </View>
                    <Text style={styles.configValue}>{vibrations}x</Text>
                  </View>
                  <Stepper
                    value={vibrations}
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={setVibrations}
                  />
                  <View style={styles.sliderLabels}>
                    <Text style={styles.sliderLabel}>1</Text>
                    <Text style={styles.sliderLabel}>5</Text>
                    <Text style={styles.sliderLabel}>10</Text>
                  </View>
                </View>

                {/* Strength */}
                <View style={styles.configSection}>
                  <View style={styles.configHeader}>
                    <View style={styles.configLabelRow}>
                      <Ionicons name="flash" size={20} color={colors.accent} />
                      <Text style={styles.configLabel}>Vibration Strength</Text>
                    </View>
                    <Text style={styles.configValue}>
                      {strength}% ({getStrengthLabel(strength)})
                    </Text>
                  </View>
                  <Stepper
                    value={strength}
                    min={10}
                    max={100}
                    step={10}
                    onValueChange={setStrength}
                  />
                  <View style={styles.sliderLabels}>
                    <Text style={styles.sliderLabel}>Light</Text>
                    <Text style={styles.sliderLabel}>Medium</Text>
                    <Text style={styles.sliderLabel}>Max</Text>
                  </View>
                </View>

                {/* Preview */}
                <View style={styles.previewSection}>
                  <Text style={styles.previewLabel}>Preview</Text>
                  <View style={styles.previewVisual}>
                    {Array.from({ length: vibrations }).map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.previewDot,
                          {
                            opacity: 0.3 + (strength / 100) * 0.7,
                            transform: [{ scale: 0.5 + (strength / 100) * 0.5 }],
                          },
                        ]}
                      />
                    ))}
                  </View>
                </View>

                {/* Test Button */}
                <TouchableOpacity
                  style={[styles.testButton, isSaving && styles.disabledButton]}
                  onPress={handleTestVibration}
                  disabled={isSaving}
                >
                  <Ionicons name="phone-portrait-outline" size={20} color={colors.textPrimary} />
                  <Text style={styles.testButtonText}>Test on Band</Text>
                </TouchableOpacity>

                {/* Info */}
                <Text style={styles.infoText}>
                  Your band will vibrate with these settings when you receive a notification from this app.
                </Text>
              </SafeAreaView>
            </View>
          </TouchableWithoutFeedback>
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
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: colors.textMuted,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cancelButton: {
    padding: spacing.xs,
  },
  cancelText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  saveButton: {
    padding: spacing.xs,
    minWidth: 50,
    alignItems: 'center',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
  },
  disabledText: {
    opacity: 0.5,
  },
  appName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  configSection: {
    marginBottom: spacing.xl,
  },
  configHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  configLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  configLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    marginLeft: spacing.sm,
  },
  configValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  sliderLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  previewSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  previewLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  previewVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  },
  previewDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    marginHorizontal: 4,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  testButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginLeft: spacing.sm,
  },
  disabledButton: {
    opacity: 0.5,
  },
  infoText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
