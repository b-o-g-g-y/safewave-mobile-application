import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ImageBackground,
  ActivityIndicator,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppListItem } from '../../components/AppListItem';
import { AppSelectionModal } from '../../components/AppSelectionModal';
import { VibrationConfigModal } from '../../components/VibrationConfigModal';
import { colors, spacing, borderRadius } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';
import { useBluetoothStore } from '../../store/bluetoothStore';
import { FirestoreService } from '../../services/firebase/FirestoreService';
import { NotificationListenerService } from '../../services/NotificationListenerService';
import { promptNotificationAccess } from '../../utils/permissions';
import { ApplicationDocument } from '../../types/user';

// Extended type with Firestore document ID
type AppWithId = ApplicationDocument & { id: string };

export const AlertsScreen: React.FC = () => {
  const { user, userDocument } = useAuthStore();
  const { connectedDevice, connectionState, writeAppSettings } = useBluetoothStore();

  const [apps, setApps] = useState<AppWithId[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingToBand, setIsSavingToBand] = useState(false);
  const [showAppSelection, setShowAppSelection] = useState(false);
  const [showVibrationConfig, setShowVibrationConfig] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppWithId | null>(null);
  const [pendingNewApp, setPendingNewApp] = useState<{ name: string; bundleId: string; iconUrl: string } | null>(null);
  const [notificationAccessGranted, setNotificationAccessGranted] = useState(true);

  const isConnected = connectionState === 'connected';
  const isAndroid = Platform.OS === 'android';

  const addedBundleIds = useMemo(
    () => new Set(apps.map(a => a.bundleIdentifier)),
    [apps]
  );

  // Subscribe to apps from Firebase
  useEffect(() => {
    if (!user?.uid) {
      setApps([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = FirestoreService.subscribeToApps(user.uid, (fetchedApps) => {
      // Filter apps based on current platform
      const platformApps = fetchedApps.filter(
        app => app.appPlatform === Platform.OS
      );
      
      console.log('[AlertsScreen] Total apps from Firebase:', fetchedApps.length);
      console.log('[AlertsScreen] Apps for', Platform.OS + ':', platformApps.length);
      
      // FirestoreService adds 'id' field to each document
      setApps(platformApps as AppWithId[]);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Check notification access on Android
  useEffect(() => {
    if (isAndroid) {
      checkNotificationAccess();
      
      // Subscribe to real-time connection status changes
      const unsubscribe = NotificationListenerService.addConnectionStatusListener((connected) => {
        console.log('[AlertsScreen] Notification service connection status:', connected);
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
    NotificationListenerService.openSettings();
  };

  const handleRefreshNotificationStatus = () => {
    checkNotificationAccess();
  };

  const handleToggleApp = async (id: string) => {
    const app = apps.find(a => a.id === id);
    if (!app) return;

    try {
      await FirestoreService.updateApp(id, { enabled: !app.enabled });
    } catch (error) {
      console.error('Failed to toggle app:', error);
    }
  };

  const handleEditApp = (app: AppWithId) => {
    setSelectedApp(app);
    setPendingNewApp(null);
    setShowVibrationConfig(true);
  };

  const handleDeleteApp = async (id: string) => {
    try {
      await FirestoreService.deleteApp(id);
    } catch (error) {
      console.error('Failed to delete app:', error);
    }
  };

  const handleAddApp = () => {
    setShowAppSelection(true);
  };

  const handleSelectApp = (app: { name: string; bundleId: string; iconUrl: string }) => {
    if (addedBundleIds.has(app.bundleId)) {
      Alert.alert('Already Added', `${app.name} is already in your alerts list.`);
      return;
    }

    setPendingNewApp(app);
    setSelectedApp(null);
    setShowAppSelection(false);
    setShowVibrationConfig(true);
  };

  const handleSaveConfig = async (vibrations: number, strength: number) => {
    try {
      if (selectedApp) {
        // Update existing app
        await FirestoreService.updateApp(selectedApp.id, {
          config: {
            numberOfVibrations: vibrations,
            strength: strength,
          },
        });
      } else if (pendingNewApp && user?.uid) {
        // Create new app
        // Get bandId from connected device or first registered band
        const bandId = connectedDevice?.id || userDocument?.bands?.[0]?.bandId || '';

        const newAppData: Omit<ApplicationDocument, 'userId'> = {
          name: pendingNewApp.name,
          bundleIdentifier: pendingNewApp.bundleId,
          imgURL: pendingNewApp.iconUrl,
          enabled: true,
          bandId: bandId,
          appPlatform: Platform.OS as 'android' | 'ios',
          config: {
            numberOfVibrations: vibrations,
            strength: strength,
          },
        };

        await FirestoreService.createApps([newAppData], user.uid);
      }

      // Push settings to band if connected (iOS only - Android intercepts notifications in app)
      if (Platform.OS === 'ios' && isConnected) {
        // Wait a bit for Firebase to update and propagate the changes
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get the updated list of enabled apps
        const enabledApps = apps
          .map(app => {
            // If this is the app we just updated, use the new values
            if (selectedApp && app.id === selectedApp.id) {
              return {
                ...app,
                config: {
                  numberOfVibrations: vibrations,
                  strength: strength,
                },
              };
            }
            return app;
          })
          .filter(app => app.enabled);

        // If we just created a new app, add it to the list
        if (pendingNewApp) {
          enabledApps.push({
            bundleIdentifier: pendingNewApp.bundleId,
            config: {
              numberOfVibrations: vibrations,
              strength: strength,
            },
          } as AppWithId);
        }

        if (enabledApps.length > 0) {
          console.log('[VibrationConfig] Pushing settings to band...');
          console.log('[VibrationConfig] Enabled apps count:', enabledApps.length);
          
          const appsToWrite = enabledApps.map(app => {
            const settings = {
              bundleIdentifier: app.bundleIdentifier,
              config: {
                strength: app.config.strength,
                numberOfVibrations: app.config.numberOfVibrations,
              },
            };
            console.log('[VibrationConfig] App settings:', JSON.stringify(settings));
            return settings;
          });

          await writeAppSettings(appsToWrite);
          console.log('[VibrationConfig] Successfully pushed settings to band');
        }
      } else {
        if (Platform.OS === 'android') {
          console.log('[VibrationConfig] Android: Skipping band sync, notifications handled by app');
        } else {
          console.log('[VibrationConfig] Band not connected, skipping band update');
        }
      }
    } catch (error) {
      console.error('Failed to save app config:', error);
      Alert.alert('Error', 'Failed to save configuration. Please try again.');
    }

    setShowVibrationConfig(false);
    setSelectedApp(null);
    setPendingNewApp(null);
  };

  const handleSaveToBand = async () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to your Safewave Band first.');
      return;
    }

    const enabledApps = apps.filter(app => app.enabled);

    if (enabledApps.length === 0) {
      Alert.alert('No Apps Enabled', 'Please enable at least one app to save to the band.');
      return;
    }

    setIsSavingToBand(true);
    try {
      await writeAppSettings(enabledApps.map(app => ({
        bundleIdentifier: app.bundleIdentifier,
        config: {
          strength: app.config.strength,
          numberOfVibrations: app.config.numberOfVibrations,
        },
      })));
      Alert.alert('Success', 'App settings saved to band successfully!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save settings to band');
    } finally {
      setIsSavingToBand(false);
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="notifications-off-outline" size={64} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>No Apps Configured</Text>
      <Text style={styles.emptySubtitle}>
        Add apps to receive vibration alerts on your Safewave Band
      </Text>
    </View>
  );

  return (
    <ImageBackground
      source={require('../../../assets/images/background.png')}
      style={styles.background}
      resizeMode="cover">
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.headerText}>
                <Text style={styles.headerTitle}>Alerts</Text>
                <Text style={styles.headerSubtitle}>
                  Configure which apps trigger your band
                </Text>
              </View>
              {/* Sync button only visible on iOS */}
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={[
                    styles.saveToBandButton,
                    !isConnected && styles.saveToBandButtonDisabled,
                  ]}
                  onPress={handleSaveToBand}
                  disabled={!isConnected || isSavingToBand}
                >
                  {isSavingToBand ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <>
                      <Image
                        source={require('../../../assets/images/logo.png')}
                        style={[
                          styles.saveToBandLogo,
                          !isConnected && styles.saveToBandLogoDisabled,
                        ]}
                        resizeMode="contain"
                      />
                      <Text style={[
                        styles.saveToBandButtonText,
                        !isConnected && styles.saveToBandButtonTextDisabled,
                      ]}>
                        Sync
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Android notification access banner */}
            {isAndroid && !notificationAccessGranted && (
              <View style={styles.notificationBanner}>
                <View style={styles.notificationBannerContent}>
                  <View style={styles.notificationBannerIconContainer}>
                    <Ionicons name="notifications-off" size={24} color={colors.accent} />
                  </View>
                  <View style={styles.notificationBannerText}>
                    <Text style={styles.notificationBannerTitle}>
                      Notification Access Required
                    </Text>
                    <Text style={styles.notificationBannerSubtitle}>
                      Enable notification access to receive alerts
                    </Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.refreshButton}
                    onPress={handleRefreshNotificationStatus}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh" size={20} color={colors.accent} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity 
                  style={styles.notificationBannerButton}
                  onPress={handleEnableNotifications}
                  activeOpacity={0.7}
                >
                  <Text style={styles.notificationBannerButtonText}>
                    Open Settings
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* App List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>Loading apps...</Text>
            </View>
          ) : (
            <FlatList
              data={apps}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <AppListItem
                  name={item.name}
                  iconUrl={item.imgURL}
                  enabled={item.enabled}
                  vibrations={item.config.numberOfVibrations}
                  strength={item.config.strength}
                  onToggle={() => handleToggleApp(item.id)}
                  onEdit={() => handleEditApp(item)}
                  onDelete={() => handleDeleteApp(item.id)}
                />
              )}
              contentContainerStyle={[
                styles.listContent,
                apps.length === 0 && styles.listContentEmpty,
              ]}
              ListEmptyComponent={renderEmptyState}
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* Add Button */}
          <TouchableOpacity style={styles.addButton} onPress={handleAddApp}>
            <Ionicons name="add" size={32} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Modals */}
      <AppSelectionModal
        visible={showAppSelection}
        onClose={() => setShowAppSelection(false)}
        onSelectApp={handleSelectApp}
        excludedBundleIds={addedBundleIds}
      />

      <VibrationConfigModal
        visible={showVibrationConfig}
        onClose={() => {
          setShowVibrationConfig(false);
          setSelectedApp(null);
          setPendingNewApp(null);
        }}
        onSave={handleSaveConfig}
        appName={selectedApp?.name || pendingNewApp?.name || ''}
        initialVibrations={selectedApp?.config.numberOfVibrations || 2}
        initialStrength={selectedApp?.config.strength || 50}
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
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    paddingVertical: spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  saveToBandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
    gap: spacing.xs,
    minWidth: 70,
    justifyContent: 'center',
  },
  saveToBandButtonDisabled: {
    backgroundColor: colors.surfaceLight,
  },
  saveToBandButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  saveToBandButtonTextDisabled: {
    color: colors.textMuted,
  },
  saveToBandLogo: {
    width: 18,
    height: 18,
  },
  saveToBandLogoDisabled: {
    opacity: 0.4,
  },
  listContent: {
    paddingBottom: 100,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  addButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  notificationBanner: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notificationBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  notificationBannerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.accent}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  notificationBannerText: {
    flex: 1,
  },
  notificationBannerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  notificationBannerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${colors.accent}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  notificationBannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  notificationBannerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
