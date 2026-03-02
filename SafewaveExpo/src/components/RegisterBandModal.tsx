import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme/colors';
import { useBluetoothStore } from '../store/bluetoothStore';
import { useAuthStore } from '../store/authStore';
import { FirestoreService } from '../services/firebase/FirestoreService';
import { BLEDevice } from '../types/bluetooth';
import { OrganizationDocument } from '../types/user';

interface RegisterBandModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'scan' | 'name' | 'checking' | 'registering';

/**
 * Get signal strength indicator based on RSSI
 */
const getSignalStrength = (rssi: number | null): { bars: number; color: string } => {
  if (rssi === null) return { bars: 0, color: colors.textMuted };
  if (rssi >= -50) return { bars: 4, color: colors.success };
  if (rssi >= -60) return { bars: 3, color: colors.success };
  if (rssi >= -70) return { bars: 2, color: colors.warning };
  return { bars: 1, color: colors.error };
};

/**
 * Signal strength indicator component
 */
const SignalIndicator: React.FC<{ rssi: number | null }> = ({ rssi }) => {
  const { bars, color } = getSignalStrength(rssi);

  return (
    <View style={styles.signalContainer}>
      {[1, 2, 3, 4].map((level) => (
        <View
          key={level}
          style={[
            styles.signalBar,
            { height: 6 + level * 4 },
            level <= bars ? { backgroundColor: color } : { backgroundColor: colors.border },
          ]}
        />
      ))}
    </View>
  );
};

/**
 * Device list item component
 */
const DeviceItem: React.FC<{
  device: BLEDevice;
  onSelect: () => void;
  isConnecting: boolean;
}> = ({ device, onSelect, isConnecting }) => (
  <TouchableOpacity
    style={styles.deviceItem}
    onPress={onSelect}
    disabled={isConnecting}
    activeOpacity={0.7}>
    <View style={styles.deviceIconContainer}>
      <Ionicons name="watch-outline" size={24} color={colors.accent} />
    </View>
    <View style={styles.deviceInfo}>
      <Text style={styles.deviceName} numberOfLines={1}>
        {device.name || device.localName || 'Unknown Device'}
      </Text>
      <Text style={styles.deviceId} numberOfLines={1}>{device.id}</Text>
    </View>
    <View style={styles.deviceActions}>
      <SignalIndicator rssi={device.rssi} />
      {isConnecting ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      )}
    </View>
  </TouchableOpacity>
);

/**
 * RegisterBandModal - Admin modal to register new bands
 */
export const RegisterBandModal: React.FC<RegisterBandModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const {
    discoveredDevices,
    isScanning,
    startScanUnfiltered,
    stopScan,
    connect,
    disconnect,
    renameBand,
    connectedDevice,
  } = useBluetoothStore();

  const { user, userDocument } = useAuthStore();

  const [step, setStep] = useState<Step>('scan');
  const [selectedDevice, setSelectedDevice] = useState<BLEDevice | null>(null);
  const [bandName, setBandName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [wasPreConnected, setWasPreConnected] = useState(false);

  // Organization selection for super_admin
  const [organizations, setOrganizations] = useState<OrganizationDocument[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  
  // Track if connected band name already exists in Firebase
  const [connectedBandExistsInFirebase, setConnectedBandExistsInFirebase] = useState(false);
  const [originalConnectedName, setOriginalConnectedName] = useState<string | null>(null);

  const isSuperAdmin = userDocument?.role === 'super_admin';

  // Reset state when modal opens - skip to name step if already connected
  useEffect(() => {
    if (visible) {
      // Reset common state
      setIsRegistering(false);
      setConnectingDeviceId(null);
      setSelectedOrgId(userDocument?.organizationId || '');
      
      // Check if there's already a connected device
      if (connectedDevice) {
        const deviceName = connectedDevice.name || connectedDevice.localName || '';
        // Skip scan step, go directly to name step
        setStep('name');
        setSelectedDevice({
          id: connectedDevice.id,
          name: connectedDevice.name || connectedDevice.localName || null,
          localName: connectedDevice.localName || null,
          rssi: null,
        });
        setBandName(deviceName);
        setOriginalConnectedName(deviceName);
        setWasPreConnected(true);
        setConnectedBandExistsInFirebase(false);
        setNameError(null);
        
        // Check if this band name already exists in Firebase or is the factory default
        const checkExistingBand = async () => {
          // Block registration if using factory default name
          if (deviceName === 'Safewave Band') {
            setNameError('Please give this band a unique name before registering.');
            return;
          }
          
          const orgId = userDocument?.organizationId;
          if (deviceName && orgId) {
            try {
              const existingBand = await FirestoreService.getBandByName(deviceName, orgId);
              if (existingBand) {
                setConnectedBandExistsInFirebase(true);
                setNameError('This band is already registered.');
              }
            } catch (error) {
              console.log('[RegisterBandModal] Error checking existing band:', error);
            }
          }
        };
        checkExistingBand();
      } else {
        setStep('scan');
        setSelectedDevice(null);
        setBandName('');
        setOriginalConnectedName(null);
        setWasPreConnected(false);
        setConnectedBandExistsInFirebase(false);
        setNameError(null);
      }
    }
  }, [visible, userDocument?.organizationId]);

  // Fetch organizations for super_admin
  useEffect(() => {
    const fetchOrganizations = async () => {
      if (visible && isSuperAdmin) {
        setIsLoadingOrgs(true);
        try {
          const orgs = await FirestoreService.getAllOrganizations();
          setOrganizations(orgs);
          if (userDocument?.organizationId && !selectedOrgId) {
            setSelectedOrgId(userDocument.organizationId);
          }
        } catch (error) {
          console.error('[RegisterBandModal] Error fetching organizations:', error);
        } finally {
          setIsLoadingOrgs(false);
        }
      }
    };
    fetchOrganizations();
  }, [visible, isSuperAdmin]);

  // Start scanning when modal opens (only if no device is already connected)
  useEffect(() => {
    if (visible && step === 'scan' && !connectedDevice) {
      startScanUnfiltered();
    }
    return () => {
      if (visible) {
        stopScan();
      }
    };
  }, [visible, step, connectedDevice]);

  const handleSelectDevice = async (device: BLEDevice) => {
    setConnectingDeviceId(device.id);
    try {
      await connect(device.id);
      setSelectedDevice(device);
      setStep('name');
      setBandName(device.name || '');
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message || 'Could not connect to device');
    } finally {
      setConnectingDeviceId(null);
    }
  };

  const targetOrgId = isSuperAdmin ? selectedOrgId : userDocument?.organizationId;

  const validateBandName = (name: string): boolean => {
    if (!name.trim()) {
      setNameError('Band name is required');
      return false;
    }
    if (name.length < 3) {
      setNameError('Band name must be at least 3 characters');
      return false;
    }
    if (name.length > 20) {
      setNameError('Band name must be 20 characters or less');
      return false;
    }
    if (isSuperAdmin && !selectedOrgId) {
      setNameError('Please select an organization');
      return false;
    }
    setNameError(null);
    return true;
  };

  const proceedWithRegistration = async () => {
    if (!user || !targetOrgId) {
      console.log('[RegisterBandModal] Missing user or targetOrgId', { user: !!user, targetOrgId });
      Alert.alert('Error', 'User information or organization not available');
      return;
    }

    console.log('[RegisterBandModal] Starting registration process', {
      bandName: bandName.trim(),
      targetOrgId,
      userId: user.uid,
      connectedDeviceId: connectedDevice?.id,
    });

    setIsRegistering(true);
    setStep('registering');

    try {
      console.log('[RegisterBandModal] Step 1: Renaming band to:', bandName.trim());
      const renameStartTime = Date.now();
      await renameBand(bandName.trim());
      const renameDuration = Date.now() - renameStartTime;
      console.log('[RegisterBandModal] Step 1 COMPLETE: Band renamed successfully', { duration: `${renameDuration}ms` });
      
      console.log('[RegisterBandModal] Step 2: Saving to Firestore...');
      const firestoreStartTime = Date.now();
      await FirestoreService.upsertRegisteredBandByName(bandName.trim(), targetOrgId, user.uid);
      const firestoreDuration = Date.now() - firestoreStartTime;
      console.log('[RegisterBandModal] Step 2 COMPLETE: Saved to Firestore successfully', { duration: `${firestoreDuration}ms` });

      // Band restarts after rename, so disconnect may fail - that's expected
      console.log('[RegisterBandModal] Step 3: Attempting disconnect...');
      try {
        await disconnect();
        console.log('[RegisterBandModal] Step 3 COMPLETE: Disconnected successfully');
      } catch (disconnectError) {
        // Ignore disconnect errors - band likely already disconnected due to restart
        console.log('[RegisterBandModal] Step 3: Disconnect error (expected if band restarted):', disconnectError);
      }

      const orgName = isSuperAdmin
        ? organizations.find(o => o.id === targetOrgId)?.name || targetOrgId
        : 'your organization';

      console.log('[RegisterBandModal] Registration COMPLETE - showing success alert');
      Alert.alert(
        'Success',
        `"${bandName.trim()}" has been registered to ${orgName}.\n\nThe band is restarting - please allow 1-2 minutes for the name change to take effect.`,
        [{ text: 'Done', onPress: () => { onSuccess?.(); onClose(); } }]
      );
    } catch (error: any) {
      console.error('[RegisterBandModal] Registration FAILED:', error);
      console.error('[RegisterBandModal] Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      Alert.alert('Registration Failed', error.message || 'Failed to register band');
      setStep('name');
    } finally {
      console.log('[RegisterBandModal] Cleaning up, setting isRegistering to false');
      setIsRegistering(false);
    }
  };

  const handleRegisterBand = async () => {
    console.log('[RegisterBandModal] handleRegisterBand called', {
      user: !!user,
      targetOrgId,
      bandName: bandName.trim(),
    });

    if (!user || !targetOrgId) {
      console.log('[RegisterBandModal] Missing user or targetOrgId, aborting');
      Alert.alert('Error', 'User information or organization not available');
      return;
    }

    const isValid = validateBandName(bandName);
    console.log('[RegisterBandModal] Band name validation result:', isValid);
    if (!isValid) return;

    // Show checking state while querying Firebase
    console.log('[RegisterBandModal] Switching to checking step');
    setStep('checking');

    try {
      console.log('[RegisterBandModal] Checking if band name exists in Firestore...');
      const existingBand = await FirestoreService.getBandByName(bandName.trim(), targetOrgId);
      console.log('[RegisterBandModal] Existing band check result:', existingBand ? 'Found existing band' : 'No existing band');

      if (existingBand) {
        const isAssigned = existingBand.assignedUserId !== null;
        console.log('[RegisterBandModal] Existing band details:', {
          isAssigned,
          assignedUserId: existingBand.assignedUserId,
        });

        const message = isAssigned
          ? `A band with the name "${bandName.trim()}" is already registered and assigned to a user.\n\nUpdating this record may affect that user.\n\nDo you want to proceed?\n\nThe connected band will be renamed and needs to restart - please allow 1-2 minutes for the change to take effect.`
          : `A band with the name "${bandName.trim()}" is already registered in this organization.\n\nDo you want to update the existing record?\n\nThe connected band will be renamed and needs to restart - please allow 1-2 minutes for the change to take effect.`;

        // Return to name step while showing alert
        console.log('[RegisterBandModal] Showing duplicate band alert, returning to name step');
        setStep('name');
        Alert.alert(
          'Band Already Registered',
          message,
          [
            { text: 'Change Name', style: 'cancel', onPress: () => console.log('[RegisterBandModal] User chose to change name') },
            { text: 'Update Existing', onPress: () => {
              console.log('[RegisterBandModal] User chose to update existing, proceeding with registration');
              proceedWithRegistration();
            }},
          ]
        );
        return;
      }

      // No duplicate - proceed directly
      console.log('[RegisterBandModal] No duplicate found, proceeding with registration');
      await proceedWithRegistration();
    } catch (error: any) {
      console.error('[RegisterBandModal] Error checking band name:', error);
      console.error('[RegisterBandModal] Error details:', {
        message: error.message,
        code: error.code,
      });
      Alert.alert('Connection Error', 'Could not verify band name. Please check your connection and try again.');
      setStep('name');
    }
  };

  const handleBack = async () => {
    if (step === 'name') {
      if (wasPreConnected) {
        // If band was already connected, just close the modal (don't disconnect)
        onClose();
      } else {
        // If we connected during this session, disconnect and go back to scan
        await disconnect();
        setSelectedDevice(null);
        setBandName('');
        setNameError(null);
        setStep('scan');
      }
    }
  };

  const handleClose = async () => {
    stopScan();
    // Only disconnect if we connected during this modal session
    if (connectedDevice && !wasPreConnected) {
      await disconnect();
    }
    onClose();
  };

  const renderScanStep = () => (
    <View style={styles.stepContent}>
      {/* Scanning Status */}
      <View style={styles.scanStatusContainer}>
        {isScanning ? (
          <>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.scanStatusText}>Scanning for bands...</Text>
          </>
        ) : (
          <>
            <Ionicons name="bluetooth" size={20} color={colors.textMuted} />
            <Text style={styles.scanStatusText}>
              {discoveredDevices.length > 0
                ? `${discoveredDevices.length} device${discoveredDevices.length !== 1 ? 's' : ''} found`
                : 'Ready to scan'}
            </Text>
          </>
        )}
      </View>

      {/* Device List */}
      {discoveredDevices.length > 0 ? (
        <FlatList
          data={discoveredDevices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DeviceItem
              device={item}
              onSelect={() => handleSelectDevice(item)}
              isConnecting={connectingDeviceId === item.id}
            />
          )}
          style={styles.deviceList}
          contentContainerStyle={styles.deviceListContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="watch-outline" size={48} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Bands Found</Text>
          <Text style={styles.emptyText}>
            Make sure your Safewave Band is powered on and nearby.
          </Text>
        </View>
      )}

      {/* Scan Button */}
      <TouchableOpacity
        style={[styles.primaryButton, isScanning && styles.primaryButtonActive]}
        onPress={isScanning ? stopScan : startScanUnfiltered}
        disabled={connectingDeviceId !== null}>
        <Ionicons
          name={isScanning ? 'stop-circle-outline' : 'search-outline'}
          size={20}
          color={colors.textPrimary}
        />
        <Text style={styles.primaryButtonText}>
          {isScanning ? 'Stop Scanning' : 'Start Scanning'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderNameStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {/* Connected Device Card */}
      <View style={styles.connectedCard}>
        <View style={styles.connectedCardIcon}>
          <Ionicons name="watch" size={28} color={colors.accent} />
        </View>
        <View style={styles.connectedCardInfo}>
          <Text style={styles.connectedCardLabel}>Connected to</Text>
          <Text style={styles.connectedCardName}>{selectedDevice?.name || 'Band'}</Text>
        </View>
        <View style={styles.connectedBadge}>
          <View style={styles.connectedDot} />
          <Text style={styles.connectedBadgeText}>Connected</Text>
        </View>
      </View>

      {/* Organization Selector - Super Admin Only */}
      {isSuperAdmin && (
        <View style={styles.formSection}>
          <Text style={styles.formLabel}>Organization</Text>
          {isLoadingOrgs ? (
            <ActivityIndicator size="small" color={colors.accent} style={styles.orgLoading} />
          ) : (
            <View style={styles.orgGrid}>
              {organizations.map((org) => (
                <TouchableOpacity
                  key={org.id}
                  style={[
                    styles.orgChip,
                    selectedOrgId === org.id && styles.orgChipSelected,
                  ]}
                  onPress={() => {
                    setSelectedOrgId(org.id);
                    setNameError(null);
                  }}>
                  <Text
                    style={[
                      styles.orgChipText,
                      selectedOrgId === org.id && styles.orgChipTextSelected,
                    ]}>
                    {org.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Band Name Input */}
      <View style={styles.formSection}>
        <Text style={styles.formLabel}>Band Name</Text>
        <View style={[styles.inputWrapper, nameError && styles.inputWrapperError]}>
          <TextInput
            style={styles.input}
            value={bandName}
            onChangeText={(text) => {
              setBandName(text);
              // If band is already registered in Firebase, keep showing that message
              if (connectedBandExistsInFirebase) {
                setNameError('This band is already registered.');
              } else if (originalConnectedName === 'Safewave Band') {
                // Factory default name - require a unique name
                if (text.trim() === 'Safewave Band' || !text.trim()) {
                  setNameError('Please give this band a unique name before registering.');
                } else {
                  setNameError(null);
                }
              } else {
                setNameError(null);
              }
            }}
            placeholder="Enter a unique name"
            placeholderTextColor={colors.textMuted}
            maxLength={20}
            autoFocus={!isSuperAdmin}
            editable={!connectedBandExistsInFirebase}
          />
          <Text style={styles.charCount}>{bandName.length}/20</Text>
        </View>
        {nameError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={14} color={colors.error} />
            <Text style={styles.errorText}>{nameError}</Text>
          </View>
        ) : (
          <Text style={styles.helperText}>
            This name will identify the band in {isSuperAdmin ? 'the selected organization' : 'your organization'}.
          </Text>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleBack}>
          <Ionicons
            name={wasPreConnected ? "close" : "arrow-back"}
            size={18}
            color={colors.textSecondary}
          />
          <Text style={styles.secondaryButtonText}>
            {wasPreConnected ? 'Cancel' : 'Back'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            styles.primaryButtonFlex,
            (!bandName.trim() || (isSuperAdmin && !selectedOrgId) || connectedBandExistsInFirebase || bandName.trim() === 'Safewave Band') && styles.buttonDisabled,
          ]}
          onPress={handleRegisterBand}
          disabled={!bandName.trim() || (isSuperAdmin && !selectedOrgId) || connectedBandExistsInFirebase || bandName.trim() === 'Safewave Band'}>
          <Text style={styles.primaryButtonText}>Register Band</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderCheckingStep = () => (
    <View style={styles.registeringContainer}>
      <View style={styles.registeringIconContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
      <Text style={styles.registeringTitle}>Checking Band Name</Text>
      <Text style={styles.registeringSubtext}>
        Verifying the band name is available...
      </Text>
    </View>
  );

  const renderRegisteringStep = () => (
    <View style={styles.registeringContainer}>
      <View style={styles.registeringIconContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
      <Text style={styles.registeringTitle}>Registering Band</Text>
      <Text style={styles.registeringSubtext}>
        Please wait while we configure your band...
      </Text>
      <View style={styles.registeringSteps}>
        <View style={styles.registeringStepItem}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.registeringStepText}>Connected to device</Text>
        </View>
        <View style={styles.registeringStepItem}>
          <ActivityIndicator size={14} color={colors.accent} />
          <Text style={styles.registeringStepText}>Renaming band...</Text>
        </View>
        <View style={styles.registeringStepItem}>
          <Ionicons name="ellipse-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.registeringStepText, styles.registeringStepPending]}>
            Saving to database
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}>
        <Pressable style={styles.overlay} onPress={handleClose}>
          <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
            <SafeAreaView edges={['bottom']} style={styles.safeArea}>
              {/* Handle Bar */}
              <View style={styles.handleBar} />

              {/* Header */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>Register Band</Text>
                  <Text style={styles.subtitle}>Add a new Safewave band to your organization</Text>
                </View>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Content */}
              {step === 'scan' && renderScanStep()}
              {step === 'name' && renderNameStep()}
              {step === 'checking' && renderCheckingStep()}
              {step === 'registering' && renderRegisteringStep()}
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: 500,
  },
  safeArea: {
    flex: 1,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    padding: spacing.xs,
    marginTop: -spacing.xs,
    marginRight: -spacing.xs,
  },

  // Step Content
  stepContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },

  // Scan Status
  scanStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  scanStatusText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Device List
  deviceList: {
    flex: 1,
    marginVertical: spacing.sm,
  },
  deviceListContent: {
    gap: spacing.sm,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  deviceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  deviceId: {
    fontSize: 12,
    color: colors.textMuted,
  },
  deviceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  signalContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 20,
    gap: 2,
  },
  signalBar: {
    width: 4,
    borderRadius: 2,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 250,
  },

  // Buttons
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  primaryButtonActive: {
    backgroundColor: colors.error,
  },
  primaryButtonFlex: {
    flex: 1,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },

  // Connected Card
  connectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  connectedCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  connectedCardInfo: {
    flex: 1,
  },
  connectedCardLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  connectedCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.round,
    gap: 4,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  connectedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.success,
  },

  // Form Section
  formSection: {
    marginBottom: spacing.lg,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  inputWrapperError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: 14,
  },
  charCount: {
    fontSize: 12,
    color: colors.textMuted,
  },
  helperText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: 4,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
  },

  // Organization
  orgLoading: {
    marginVertical: spacing.md,
  },
  orgGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  orgChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.round,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orgChipSelected: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderColor: colors.accent,
  },
  orgChipText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  orgChipTextSelected: {
    color: colors.accent,
    fontWeight: '600',
  },

  // Registering Step
  registeringContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  registeringIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  registeringTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  registeringSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  registeringSteps: {
    gap: spacing.md,
    width: '100%',
    maxWidth: 250,
  },
  registeringStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  registeringStepText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  registeringStepPending: {
    color: colors.textMuted,
  },
});
