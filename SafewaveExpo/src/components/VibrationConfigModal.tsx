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
  Switch,
  TextInput,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme/colors';
import { useBluetoothStore } from '../store/bluetoothStore';
import { VibrationCommand, resolveLiveNumBuzzes } from '../types/bluetooth';

// Simple Stepper Component (replaces native Slider)
interface StepperProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  disabled?: boolean;
}

const Stepper: React.FC<StepperProps> = ({ value, min, max, step, onValueChange, disabled = false }) => {
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

  const decrementDisabled = disabled || value <= min;
  const incrementDisabled = disabled || value >= max;

  return (
    <View style={[stepperStyles.container, disabled && stepperStyles.containerDisabled]}>
      <TouchableOpacity
        style={[stepperStyles.button, decrementDisabled && stepperStyles.buttonDisabled]}
        onPress={decrement}
        disabled={decrementDisabled}
      >
        <Ionicons name="remove" size={24} color={decrementDisabled ? colors.textMuted : colors.textPrimary} />
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
        style={[stepperStyles.button, incrementDisabled && stepperStyles.buttonDisabled]}
        onPress={increment}
        disabled={incrementDisabled}
      >
        <Ionicons name="add" size={24} color={incrementDisabled ? colors.textMuted : colors.textPrimary} />
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
  containerDisabled: {
    opacity: 0.4,
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
  onSave: (
    vibrations: number,
    strength: number,
    phrases: string[],
    phraseMode: 'allow' | 'block'
  ) => void | Promise<void>;
  appName: string;
  initialVibrations?: number;
  initialStrength?: number;
  initialPhrases?: string[];
  initialPhraseMode?: 'allow' | 'block';
  platform?: 'android' | 'ios';
}

export const VibrationConfigModal: React.FC<VibrationConfigModalProps> = ({
  visible,
  onClose,
  onSave,
  appName,
  initialVibrations = 2,
  initialStrength = 50,
  initialPhrases = [],
  initialPhraseMode = 'allow',
  platform = 'android',
}) => {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Cap the sheet so its top (and the pinned Cancel/Save header) always clears
  // the status bar / notch, while still hugging content when the sheet is short.
  const maxSheetHeight = windowHeight - insets.top - spacing.md;

  // 0 means "repeat until dismissed" (continuous). The stepper itself always
  // holds a usable 1-10 value so toggling continuous off restores a real count.
  const [continuous, setContinuous] = useState(initialVibrations === 0);
  const [vibrations, setVibrations] = useState(initialVibrations === 0 ? 2 : initialVibrations);
  const [strength, setStrength] = useState(initialStrength);
  const [phrases, setPhrases] = useState<string[]>(initialPhrases);
  const [phraseMode, setPhraseMode] = useState<'allow' | 'block'>(initialPhraseMode);
  const [phraseDraft, setPhraseDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { vibrate, connectionState } = useBluetoothStore();

  // Phrase filtering is only enforced on Android (notifications are intercepted
  // in-app there). On iOS the band does its own matching, so hide the section.
  const showPhraseFilter = platform === 'android';

  // Reset values when modal opens with new initial values
  useEffect(() => {
    if (visible) {
      setContinuous(initialVibrations === 0);
      setVibrations(initialVibrations === 0 ? 2 : initialVibrations);
      setStrength(initialStrength);
      setPhrases(initialPhrases);
      setPhraseMode(initialPhraseMode);
      setPhraseDraft('');
      setIsSaving(false);
    }
    // initialPhrases is a new array reference each render; key the reset on
    // visibility/count so we restore from props only when the modal (re)opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialVibrations, initialStrength, initialPhraseMode]);

  const addPhrase = () => {
    const next = phraseDraft.trim();
    if (!next) return;
    setPhrases((current) =>
      current.some((p) => p.toLowerCase() === next.toLowerCase())
        ? current
        : [...current, next]
    );
    setPhraseDraft('');
  };

  const removePhrase = (phrase: string) => {
    setPhrases((current) => current.filter((p) => p !== phrase));
  };

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
      // Create vibration command with current settings.
      // In continuous mode the band repeats until the physical button is
      // pressed: iOS firmware understands numBuzzes=0 directly, while Android
      // needs a large finite count (resolveLiveNumBuzzes handles the mapping).
      const vibrationCommand: VibrationCommand = {
        strength: strength,
        numBuzzes: resolveLiveNumBuzzes(continuous ? 0 : vibrations, platform),
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
      // Only persist phrase rules for platforms where they apply.
      const phrasesToSave = showPhraseFilter ? phrases : [];
      await onSave(continuous ? 0 : vibrations, strength, phrasesToSave, phraseMode);
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
            <View style={[styles.modalContent, { maxHeight: maxSheetHeight }]}>
              <SafeAreaView edges={['bottom']} style={styles.safeAreaBody}>
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

                <ScrollView
                  style={styles.scrollArea}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                {/* App Name */}
                <Text style={styles.appName}>{appName}</Text>

                {/* Vibration Count */}
                <View style={styles.configSection}>
                  <View style={styles.configHeader}>
                    <View style={styles.configLabelRow}>
                      <Ionicons name="pulse" size={20} color={colors.accent} />
                      <Text style={styles.configLabel}>Number of Vibrations</Text>
                    </View>
                    {continuous ? (
                      <View style={styles.continuousValue}>
                        <Ionicons name="infinite" size={18} color={colors.accent} />
                        <Text style={[styles.configValue, styles.continuousValueText]}>
                          Continuous
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.configValue}>{vibrations}x</Text>
                    )}
                  </View>

                  {/* Repeat until dismissed toggle */}
                  <View style={styles.continuousRow}>
                    <Text style={styles.continuousLabel}>Repeat until dismissed</Text>
                    <Switch
                      value={continuous}
                      onValueChange={setContinuous}
                      trackColor={{ false: colors.surfaceLight, true: colors.accent }}
                      thumbColor={colors.textPrimary}
                      ios_backgroundColor={colors.surfaceLight}
                    />
                  </View>

                  <Stepper
                    value={vibrations}
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={setVibrations}
                    disabled={continuous}
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

                {/* Notification filter (Android only) */}
                {showPhraseFilter && (
                  <View style={styles.configSection}>
                    <View style={styles.configHeader}>
                      <View style={styles.configLabelRow}>
                        <Ionicons name="funnel" size={20} color={colors.accent} />
                        <Text style={styles.configLabel}>Notification Filter</Text>
                      </View>
                    </View>

                    {/* Mode toggle — only relevant once phrases exist */}
                    {phrases.length > 0 && (
                      <View style={styles.continuousRow}>
                        <Text style={styles.continuousLabel}>
                          {phraseMode === 'allow'
                            ? 'Only vibrate for matches'
                            : 'Mute matches, vibrate for the rest'}
                        </Text>
                        <Switch
                          value={phraseMode === 'allow'}
                          onValueChange={(on) => setPhraseMode(on ? 'allow' : 'block')}
                          trackColor={{ false: colors.surfaceLight, true: colors.accent }}
                          thumbColor={colors.textPrimary}
                          ios_backgroundColor={colors.surfaceLight}
                        />
                      </View>
                    )}

                    {/* Phrase entry row */}
                    <View style={styles.phraseInputRow}>
                      <TextInput
                        style={styles.phraseInput}
                        value={phraseDraft}
                        onChangeText={setPhraseDraft}
                        onSubmitEditing={addPhrase}
                        placeholder="Add a word or phrase"
                        placeholderTextColor={colors.textMuted}
                        returnKeyType="done"
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        style={[
                          styles.phraseAddButton,
                          !phraseDraft.trim() && styles.phraseAddButtonDisabled,
                        ]}
                        onPress={addPhrase}
                        disabled={!phraseDraft.trim()}
                      >
                        <Ionicons name="add" size={24} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>

                    {/* Current phrases as removable chips */}
                    {phrases.length > 0 ? (
                      <View style={styles.chipContainer}>
                        {phrases.map((phrase) => (
                          <TouchableOpacity
                            key={phrase}
                            style={styles.chip}
                            onPress={() => removePhrase(phrase)}
                          >
                            <Text style={styles.chipText} numberOfLines={1}>
                              {phrase}
                            </Text>
                            <Ionicons name="close" size={14} color={colors.textSecondary} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.phraseHelperText}>
                        Vibrates for all notifications from this app. Add a phrase to vibrate only
                        for matching notifications.
                      </Text>
                    )}
                  </View>
                )}

                {/* Preview */}
                <View style={styles.previewSection}>
                  <Text style={styles.previewLabel}>Preview</Text>
                  <View style={styles.previewVisual}>
                    {continuous ? (
                      <View style={styles.previewContinuous}>
                        <View
                          style={[
                            styles.previewDot,
                            {
                              opacity: 0.3 + (strength / 100) * 0.7,
                              transform: [{ scale: 0.5 + (strength / 100) * 0.5 }],
                            },
                          ]}
                        />
                        <Ionicons name="infinite" size={24} color={colors.accent} />
                      </View>
                    ) : (
                      Array.from({ length: vibrations }).map((_, i) => (
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
                      ))
                    )}
                  </View>
                </View>

                {/* Info */}
                <Text style={styles.infoText}>
                  {continuous
                    ? 'Your band will keep vibrating until you press the button on the band when you receive a notification from this app.'
                    : 'Your band will vibrate with these settings when you receive a notification from this app.'}
                </Text>
                </ScrollView>

                {/* Test Button (pinned below the scroll area so it's always reachable) */}
                <TouchableOpacity
                  style={[styles.testButton, isSaving && styles.disabledButton]}
                  onPress={handleTestVibration}
                  disabled={isSaving}
                >
                  <Ionicons name="phone-portrait-outline" size={20} color={colors.textPrimary} />
                  <Text style={styles.testButtonText}>Test on Band</Text>
                </TouchableOpacity>
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
    // maxHeight is applied inline from the safe-area inset so the sheet's top
    // always clears the status bar; the body (ScrollView) scrolls instead.
    // Keeps the handle bar + header (Cancel/Save) pinned and always visible.
  },
  safeAreaBody: {
    // Allow the body to shrink so the inner ScrollView gets a bounded height.
    flexShrink: 1,
  },
  scrollArea: {
    // Lets the scrollable body shrink within the capped modal height.
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
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
  continuousValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  continuousValueText: {
    marginLeft: spacing.xs,
  },
  continuousRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  continuousLabel: {
    fontSize: 14,
    color: colors.textSecondary,
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
  phraseInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  phraseInput: {
    flex: 1,
    height: 44,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
  },
  phraseAddButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  phraseAddButtonDisabled: {
    opacity: 0.4,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.round,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 14,
    color: colors.textPrimary,
    marginRight: spacing.xs,
    flexShrink: 1,
  },
  phraseHelperText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: spacing.sm,
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
  previewContinuous: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    marginTop: spacing.md,
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
