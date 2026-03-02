import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Logo } from '../../components/Logo';
import { DeviceSelectionModal } from '../../components/DeviceSelectionModal';
import { BandInfoModal } from '../../components/BandInfoModal';
import { BatteryProgressCircle } from '../../components/BatteryProgressCircle';
import { RegisterBandModal } from '../../components/RegisterBandModal';
import { colors, spacing, borderRadius } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';
import { useBluetoothStore } from '../../store/bluetoothStore';
import { FirestoreService } from '../../services/firebase/FirestoreService';
import { NotificationListenerService } from '../../services/NotificationListenerService';
import { promptNotificationAccess } from '../../utils/permissions';
import { BLEDevice } from '../../types/bluetooth';
import { ApplicationDocument } from '../../types/user';
import { MainTabParamList } from '../../navigation/MainTabNavigator';

type HomeScreenNavigationProp = BottomTabNavigationProp<MainTabParamList, 'Home'>;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { user, userDocument } = useAuthStore();
  const {
    connectionState,
    connectedDevice,
    discoveredDevices,
    isScanning,
    reconnectingDeviceName,
    batteryLevel,
    isCharging,
    bluetoothEnabled,
    error,
    assignedBands,
    initialize,
    startScan,
    stopScan,
    connect,
    disconnect,
    testVibration,
    clearError,
    fetchAssignedBands,
  } = useBluetoothStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [bandInfoModalVisible, setBandInfoModalVisible] = useState(false);
  const [registerBandModalVisible, setRegisterBandModalVisible] = useState(false);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [enabledAppsCount, setEnabledAppsCount] = useState(0);
  const [isRefreshingBands, setIsRefreshingBands] = useState(false);
  const [notificationAccessGranted, setNotificationAccessGranted] = useState(true);

  // Check if user is admin
  const isAdmin = userDocument?.role === 'org_admin' || userDocument?.role === 'super_admin';
  const hasOrganization = !!userDocument?.organizationId;
  const isOrgUserWithNoBands = !isAdmin && hasOrganization && assignedBands.length === 0;
  const isAndroid = Platform.OS === 'android';

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Initialize Bluetooth on mount
  useEffect(() => {
    initialize();

    // Fade in animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.1)),
      }),
    ]).start();
  }, []);

  // Fetch assigned bands for organization users
  useEffect(() => {
    if (!isAdmin && hasOrganization) {
      fetchAssignedBands();
    }
  }, [isAdmin, hasOrganization]);

  // Subscribe to apps from Firebase
  useEffect(() => {
    if (!user?.uid) {
      setEnabledAppsCount(0);
      return;
    }

    const unsubscribe = FirestoreService.subscribeToApps(user.uid, (apps: ApplicationDocument[]) => {
      // Filter apps based on current platform and count enabled ones
      const platformApps = apps.filter(app => app.appPlatform === Platform.OS);
      const enabledCount = platformApps.filter((app) => app.enabled).length;
      setEnabledAppsCount(enabledCount);
      
      console.log('[HomeScreen] Total apps:', apps.length, '| Platform apps:', platformApps.length, '| Enabled:', enabledCount);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Check notification access on Android
  useEffect(() => {
    if (isAndroid) {
      checkNotificationAccess();
      
      // Subscribe to real-time connection status changes
      const unsubscribe = NotificationListenerService.addConnectionStatusListener((connected) => {
        console.log('[HomeScreen] Notification service connection status:', connected);
        setNotificationAccessGranted(connected);
      });
      
      return () => unsubscribe();
    }
  }, [isAndroid]);

  const checkNotificationAccess = async () => {
    if (isAndroid) {
      const granted = NotificationListenerService.checkPermission();
      setNotificationAccessGranted(granted);
    }
  };

  const handleEnableNotifications = () => {
    promptNotificationAccess();
  };

  // Pulse animation when charging
  useEffect(() => {
    if (isCharging) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isCharging]);

  // Show error alerts
  useEffect(() => {
    if (error) {
      Alert.alert('Bluetooth Error', error, [
        { text: 'OK', onPress: clearError },
      ]);
    }
  }, [error]);

  const handleOpenModal = () => {
    setModalVisible(true);
    startScan();
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    stopScan();
  };

  const handleSelectDevice = async (device: BLEDevice) => {
    setConnectingDeviceId(device.id);
    try {
      await connect(device.id);
      setModalVisible(false);
      // Alert.alert('Connected', `Successfully connected to ${device.name || 'Safewave Band'}`);
    } catch (err: any) {
      // Alert.alert('Connection Failed', err.message || 'Could not connect to device');
    } finally {
      setConnectingDeviceId(null);
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect', 'Disconnect from Safewave Band?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            await disconnect();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to disconnect');
          }
        },
      },
    ]);
  };

  const handleTestVibration = async () => {
    try {
      await testVibration();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send vibration');
    }
  };

  const handleBandIconPress = () => {
    if (isConnected) {
      setBandInfoModalVisible(true);
    }
  };

  const handleAppsMonitoringPress = () => {
    navigation.navigate('Alerts');
  };

  const handleRefreshBands = async () => {
    setIsRefreshingBands(true);
    try {
      await fetchAssignedBands();
    } finally {
      setIsRefreshingBands(false);
    }
  };

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  const isReconnecting = connectionState === 'reconnecting' || (isConnecting && !!reconnectingDeviceName);
  const displayName = userDocument?.displayName || user?.displayName || 'User';
  const reconnectDisplayName = reconnectingDeviceName || 'Safewave Band';

  return (
    <ImageBackground
      source={require('../../../assets/images/background.png')}
      style={styles.background}
      resizeMode="cover">
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          style={[styles.scrollView, { opacity: fadeAnim }]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Logo size="small" showIcon={false} />
          </View>

          {/* User Name */}
          <Text style={styles.userName}>{displayName}</Text>

          {/* Band Icon - Tappable when connected */}
          <Animated.View style={[
            styles.bandIconContainer,
            { transform: [{ scale: scaleAnim }] }
          ]}>
            <TouchableOpacity
              onPress={handleBandIconPress}
              disabled={!isConnected}
              activeOpacity={isConnected ? 0.8 : 1}
            >
              {isConnected ? (
                <Animated.View style={[
                  styles.connectedGlow,
                  { transform: [{ scale: pulseAnim }] }
                ]}>
                  <BatteryProgressCircle
                    size={150}
                    strokeWidth={6}
                    progress={batteryLevel ?? 0}
                  >
                    <View style={styles.bandIconCircle}>
                      <Image
                        source={require('../../../assets/images/logo.png')}
                        style={styles.bandIcon}
                        resizeMode="contain"
                      />
                    </View>
                  </BatteryProgressCircle>
                </Animated.View>
              ) : (
                <View style={styles.bandIconOuter}>
                  <View style={styles.bandIconCircle}>
                    <Image
                      source={require('../../../assets/images/logo.png')}
                      style={styles.bandIcon}
                      resizeMode="contain"
                    />
                  </View>
                </View>
              )}
            </TouchableOpacity>
            {isConnected && (
              <Text style={styles.tapHint}>Tap for band info</Text>
            )}
          </Animated.View>

          {/* Band Name & Status - only when connected or connecting */}
          {(isConnected || isConnecting || isReconnecting) && (
            <View style={styles.statusContainer}>
              <Text style={styles.bandName}>
                {isConnected ? (connectedDevice?.name || 'Safewave Band') : reconnectDisplayName}
              </Text>
              <View style={styles.statusRow}>
                <View style={[
                  styles.statusDot,
                  isConnected ? styles.statusDotConnected : styles.statusDotConnecting
                ]} />
                <Text style={[
                  styles.connectionStatus,
                  isConnected ? styles.statusConnectedText : styles.statusConnectingText
                ]}>
                  {isConnected ? 'Connected' : isReconnecting ? 'Reconnecting...' : 'Connecting...'}
                </Text>
              </View>
              {isReconnecting && (
                <View style={styles.reconnectChip}>
                  <Ionicons name="search-outline" size={14} color={colors.warning} />
                  <Text style={styles.reconnectChipText}>
                    Looking for {reconnectDisplayName}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Bluetooth Off Banner */}
          {!bluetoothEnabled && (
            <View style={styles.bluetoothOffBanner}>
              <Ionicons name="bluetooth-outline" size={24} color={colors.warning} />
              <View style={styles.bluetoothOffContent}>
                <Text style={styles.bluetoothOffTitle}>Bluetooth is Off</Text>
                <Text style={styles.bluetoothOffMessage}>
                  Please enable Bluetooth in your device settings to connect to your Safewave Band.
                </Text>
              </View>
            </View>
          )}

          {/* Android Notification Access Banner */}
          {isAndroid && !notificationAccessGranted && enabledAppsCount > 0 && (
            <TouchableOpacity
              style={styles.notificationBanner}
              onPress={handleEnableNotifications}
              activeOpacity={0.7}
            >
              <View style={styles.notificationBannerIconContainer}>
                <Ionicons name="notifications-off" size={24} color={colors.accent} />
              </View>
              <View style={styles.notificationBannerContent}>
                <Text style={styles.notificationBannerTitle}>Enable Notification Access</Text>
                <Text style={styles.notificationBannerMessage}>
                  You have {enabledAppsCount} app{enabledAppsCount > 1 ? 's' : ''} monitoring. Enable notification access to receive alerts.
                </Text>
                <View style={styles.notificationBannerButton}>
                  <Text style={styles.notificationBannerButtonText}>Enable Now</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.textPrimary} />
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* No Bands Assigned Banner - Organization Users Only */}
          {isOrgUserWithNoBands && (
            <View style={styles.noBandsBanner}>
              <Ionicons name="information-circle-outline" size={24} color={colors.accent} />
              <View style={styles.noBandsBannerContent}>
                <Text style={styles.noBandsBannerTitle}>No Band Assigned</Text>
                <Text style={styles.noBandsBannerMessage}>
                  You don't have a Safewave Band assigned yet. Please contact your organization administrator to get a band assigned to your account.
                </Text>
              </View>
            </View>
          )}

          {/* Stats Row */}
          <View style={styles.statsCard}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={handleAppsMonitoringPress}
              activeOpacity={0.7}
            >
              <Ionicons name="apps" size={20} color={colors.accent} style={styles.statIcon} />
              <Text style={styles.statLabel}>Apps Monitoring</Text>
              <Text style={styles.statValue}>{enabledAppsCount}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.statChevron} />
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons
                name={isCharging ? 'battery-charging' : 'battery-half'}
                size={20}
                color={batteryLevel !== null && batteryLevel <= 20 ? colors.error : colors.success}
                style={styles.statIcon}
              />
              <Text style={styles.statLabel}>Battery</Text>
              <View style={styles.statValueRow}>
                <Text style={[
                  styles.statValue,
                  batteryLevel !== null && batteryLevel <= 20 && styles.statValueLow
                ]}>
                  {batteryLevel !== null ? `${batteryLevel.toFixed(0)}%` : '--'}
                </Text>
                {isCharging && (
                  <Ionicons
                    name="flash"
                    size={14}
                    color={colors.success}
                    style={styles.chargingIcon}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsSection}>
            {isConnected ? (
              <>
                <TouchableOpacity style={styles.testButton} onPress={handleTestVibration}>
                  <Ionicons name="phone-portrait-outline" size={22} color={colors.accent} />
                  <Text style={styles.testButtonText}>Test Vibration</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
                  <Ionicons name="close-circle-outline" size={22} color={colors.error} />
                  <Text style={styles.disconnectButtonText}>Disconnect</Text>
                </TouchableOpacity>
              </>
            ) : isOrgUserWithNoBands ? (
              <TouchableOpacity
                style={[styles.refreshButton, isRefreshingBands && styles.buttonDisabled]}
                onPress={handleRefreshBands}
                disabled={isRefreshingBands}
              >
                <Ionicons name="refresh" size={22} color={colors.accent} />
                <Text style={styles.refreshButtonText}>
                  {isRefreshingBands ? 'Checking...' : 'Check for Assigned Bands'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.connectButton, !bluetoothEnabled && styles.buttonDisabled]}
                onPress={handleOpenModal}
                disabled={isConnecting || !bluetoothEnabled}
              >
                <Ionicons name="bluetooth" size={22} color={colors.primary} />
                <Text style={styles.connectButtonText}>
                  {isConnecting ? 'Connecting...' : 'Connect Band'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Register Band Button - Admin Only (always visible for admins) */}
            {isAdmin && (
              <TouchableOpacity
                style={[styles.registerBandButton, !bluetoothEnabled && styles.buttonDisabled]}
                onPress={() => setRegisterBandModalVisible(true)}
                disabled={!bluetoothEnabled}
              >
                <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
                <Text style={styles.registerBandButtonText}>Register New Band</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.ScrollView>
      </SafeAreaView>

      {/* Device Selection Modal */}
      <DeviceSelectionModal
        visible={modalVisible}
        onClose={handleCloseModal}
        devices={discoveredDevices}
        isScanning={isScanning}
        onSelectDevice={handleSelectDevice}
        onStartScan={startScan}
        onStopScan={stopScan}
        isConnecting={connectingDeviceId !== null}
        connectingDeviceId={connectingDeviceId}
      />

      {/* Band Info Modal */}
      <BandInfoModal
        visible={bandInfoModalVisible}
        onClose={() => setBandInfoModalVisible(false)}
      />

      {/* Register Band Modal - Admin Only */}
      <RegisterBandModal
        visible={registerBandModalVisible}
        onClose={() => setRegisterBandModalVisible(false)}
      />
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  userName: {
    fontSize: 24,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  bandIconContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  bandIconOuter: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'transparent',
    borderWidth: 6,
    borderColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bandIconCircle: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bandIcon: {
    width: 70,
    height: 70,
  },
  connectedGlow: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  tapHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  bandName: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  statusDotConnected: {
    backgroundColor: colors.success,
  },
  statusDotDisconnected: {
    backgroundColor: colors.error,
  },
  statusDotConnecting: {
    backgroundColor: colors.warning,
  },
  connectionStatus: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusConnectedText: {
    color: colors.success,
  },
  statusDisconnectedText: {
    color: colors.error,
  },
  statusConnectingText: {
    color: colors.warning,
  },
  reconnectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  reconnectChipText: {
    marginLeft: spacing.xs,
    fontSize: 13,
    fontWeight: '600',
    color: colors.warning,
  },
  bluetoothOffBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bluetoothOffContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  bluetoothOffTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.warning,
    marginBottom: spacing.xs,
  },
  bluetoothOffMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  noBandsBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noBandsBannerContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  noBandsBannerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  noBandsBannerMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  statIcon: {
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statValueLow: {
    color: colors.error,
  },
  chargingIcon: {
    marginLeft: 4,
  },
  statChevron: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -8,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  actionsSection: {
    gap: spacing.md,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  testButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    marginLeft: spacing.sm,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    borderColor: colors.error,
    paddingVertical: 16,
  },
  disconnectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
    marginLeft: spacing.sm,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    marginLeft: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  registerBandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    borderColor: colors.accent,
    paddingVertical: 16,
  },
  registerBandButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    marginLeft: spacing.sm,
  },
  notificationBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    padding: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  notificationBannerIconContainer: {
    marginRight: spacing.md,
    marginTop: 2,
  },
  notificationBannerContent: {
    flex: 1,
  },
  notificationBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  notificationBannerMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  notificationBannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  notificationBannerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
