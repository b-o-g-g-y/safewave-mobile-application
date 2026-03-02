import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
  Dimensions,
  NativeModules,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme/colors';
import { FirestoreService } from '../services/firebase/FirestoreService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Import the native module for Android installed apps
const { RNInstalledApplication } = NativeModules;

// iTunes Search API response types
interface ITunesSearchResult {
  trackName: string;
  bundleId: string;
  artworkUrl60: string;
  artworkUrl100?: string;
}

interface ITunesSearchResponse {
  resultCount: number;
  results: ITunesSearchResult[];
}

interface AppInfo {
  name: string;
  bundleId: string;
  iconUrl: string;
}

interface AppSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectApp: (app: AppInfo) => void;
  excludedBundleIds?: Set<string>;
}

// Type for Android installed app from the native module
interface AndroidInstalledApp {
  appName: string;
  packageName: string;
  icon?: string; // Base64 encoded icon
}

// Mock data for Android (fallback if native module fails)
const MOCK_ANDROID_APPS: AppInfo[] = [];

// Default recommended iOS apps (native + popular apps)
// These are used as fallback if Firebase collection is empty
const DEFAULT_IOS_APPS: AppInfo[] = [
  {
    name: 'Phone',
    bundleId: 'com.apple.mobilephone',
    iconUrl: '', // Native app - will use fallback icon
  },
  {
    name: 'Messages',
    bundleId: 'com.apple.MobileSMS',
    iconUrl: '', // Native app - will use fallback icon
  },
  {
    name: 'Clock',
    bundleId: 'com.apple.mobiletimer',
    iconUrl: '', // Native app - will use fallback icon
  },
  {
    name: 'Calendar',
    bundleId: 'com.apple.mobilecal',
    iconUrl: '', // Native app - will use fallback icon
  },
  {
    name: 'Ring - Always Home',
    bundleId: 'com.ring',
    iconUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/05/a5/0c/05a50c93-e4d1-5606-7d6c-1ad4c2e2027d/AppIcon-0-0-1x_U007epad-0-1-85-220.png/100x100bb.jpg',
  },
  {
    name: 'ADT',
    bundleId: 'com.adt.ADTControlAlarm',
    iconUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/c8/8c/16/c88c1609-3d42-eab7-6317-1f8a6e0fbb5c/AppIcon-0-0-1x_U007epad-0-1-85-220.png/100x100bb.jpg',
  },
  {
    name: 'SimpliSafe Home Security',
    bundleId: 'com.simplisafe.mobile',
    iconUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/91/fc/b8/91fcb854-3a37-9c8a-8426-4a3b4e6e9e0a/AppIcon-0-0-1x_U007epad-0-1-85-220.png/100x100bb.jpg',
  },
];

// Get color for app avatar
const getAppColor = (bundleId: string): string => {
  const appColors = ['#4A154B', '#25D366', '#464EB8', '#EA4335', '#0088CC', '#5865F2', '#0084FF', '#2C6BED'];
  let hash = 0;
  for (let i = 0; i < bundleId.length; i++) {
    hash = bundleId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return appColors[Math.abs(hash) % appColors.length];
};

const ITEMS_PER_PAGE = 20;

const EMPTY_SET = new Set<string>();

export const AppSelectionModal: React.FC<AppSelectionModalProps> = ({
  visible,
  onClose,
  onSelectApp,
  excludedBundleIds = EMPTY_SET,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [iTunesResults, setITunesResults] = useState<AppInfo[]>([]);
  const [androidApps, setAndroidApps] = useState<AppInfo[]>([]);
  const [isLoadingAndroidApps, setIsLoadingAndroidApps] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasMoreResults, setHasMoreResults] = useState(true);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [recommendedApps, setRecommendedApps] = useState<AppInfo[]>(DEFAULT_IOS_APPS);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentSearchRef = useRef<string>('');

  const isIOS = Platform.OS === 'ios';

  // Fetch icons from Firebase and merge with hardcoded app list
  useEffect(() => {
    if (!isIOS) {
      // Fetch installed apps on Android
      fetchAndroidInstalledApps();
      return;
    }

    const fetchAppIcons = async () => {
      try {
        const firebaseApps = await FirestoreService.getIOSApps();

        // Create a map of bundleId -> iconUrl from Firebase
        const iconMap = new Map<string, string>();
        firebaseApps.forEach(app => {
          if (app.imgURL) {
            iconMap.set(app.bundleId, app.imgURL);
          }
        });

        // Merge Firebase icons with the hardcoded list
        const appsWithIcons = DEFAULT_IOS_APPS.map(app => ({
          ...app,
          iconUrl: iconMap.get(app.bundleId) || app.iconUrl,
        }));

        setRecommendedApps(appsWithIcons);
      } catch (error) {
        console.error('Failed to fetch app icons from Firebase:', error);
        // On error, use the default icons (fallback letters)
        setRecommendedApps(DEFAULT_IOS_APPS);
      }
    };

    fetchAppIcons();
  }, [isIOS]);

  // Fetch installed apps on Android
  const fetchAndroidInstalledApps = async () => {
    setIsLoadingAndroidApps(true);
    try {
      if (!RNInstalledApplication) {
        console.warn('RNInstalledApplication module not available');
        setAndroidApps(MOCK_ANDROID_APPS);
        return;
      }

      // Get non-system apps only
      const installedApps: AndroidInstalledApp[] = await RNInstalledApplication.getNonSystemApps();
      
      const formattedApps: AppInfo[] = installedApps.map(app => ({
        name: app.appName,
        bundleId: app.packageName,
        iconUrl: app.icon ? `data:image/png;base64,${app.icon}` : '',
      }));

      // Sort alphabetically by name
      formattedApps.sort((a, b) => a.name.localeCompare(b.name));

      setAndroidApps(formattedApps);
      console.log(`[AppSelectionModal] Loaded ${formattedApps.length} Android apps`);
    } catch (error) {
      console.error('Failed to fetch Android installed apps:', error);
      setAndroidApps(MOCK_ANDROID_APPS);
    } finally {
      setIsLoadingAndroidApps(false);
    }
  };

  // Search iTunes App Store
  const searchITunes = useCallback(async (searchText: string, offset: number = 0, append: boolean = false) => {
    if (searchText.trim().length < 2) {
      setITunesResults([]);
      setSearchError(null);
      setHasMoreResults(true);
      setCurrentOffset(0);
      return;
    }

    // Track current search to prevent race conditions
    currentSearchRef.current = searchText;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsSearching(true);
      setCurrentOffset(0);
      setHasMoreResults(true);
    }
    setSearchError(null);

    try {
      const params = new URLSearchParams({
        term: searchText,
        entity: 'software',
        media: 'software',
        limit: String(ITEMS_PER_PAGE),
        offset: String(offset),
      });

      const url = `https://itunes.apple.com/search?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to search App Store');
      }

      const data: ITunesSearchResponse = await response.json();

      // Check if search query changed while fetching
      if (currentSearchRef.current !== searchText) {
        return;
      }

      // Map iTunes results to AppInfo format
      const apps: AppInfo[] = data.results.map((result) => ({
        name: result.trackName,
        bundleId: result.bundleId,
        iconUrl: result.artworkUrl100 || result.artworkUrl60,
      }));

      // Check if we have more results to load
      setHasMoreResults(data.results.length === ITEMS_PER_PAGE);
      setCurrentOffset(offset + data.results.length);

      if (append) {
        // Filter out duplicates when appending
        setITunesResults(prev => {
          const existingIds = new Set(prev.map(app => app.bundleId));
          const newApps = apps.filter(app => !existingIds.has(app.bundleId));
          return [...prev, ...newApps];
        });
      } else {
        setITunesResults(apps);
      }
    } catch (error) {
      console.error('iTunes search error:', error);
      if (!append) {
        setSearchError('Failed to search App Store. Please try again.');
        setITunesResults([]);
      }
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Load more results for infinite scroll
  const loadMoreResults = useCallback(() => {
    if (isLoadingMore || isSearching || !hasMoreResults || !isIOS) {
      return;
    }

    if (searchQuery.trim().length >= 2) {
      searchITunes(searchQuery, currentOffset, true);
    }
  }, [isLoadingMore, isSearching, hasMoreResults, isIOS, searchQuery, currentOffset, searchITunes]);

  // Debounced search for iOS
  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);

    if (isIOS) {
      // Clear previous timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounced search
      debounceTimerRef.current = setTimeout(() => {
        searchITunes(text);
      }, 500);
    }
  }, [isIOS, searchITunes]);

  // Clear results when modal closes
  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
      setITunesResults([]);
      setSearchError(null);
      setHasMoreResults(true);
      setCurrentOffset(0);
      currentSearchRef.current = '';
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    }
  }, [visible]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Filter recommended apps based on search query
  const filteredRecommendedApps = useMemo(() => {
    const base = recommendedApps.filter(app => !excludedBundleIds.has(app.bundleId));
    if (!searchQuery.trim()) return base;
    const query = searchQuery.toLowerCase();
    return base.filter(app =>
      app.name.toLowerCase().includes(query) ||
      app.bundleId.toLowerCase().includes(query)
    );
  }, [searchQuery, recommendedApps, excludedBundleIds]);

  // Filter Android apps based on search query
  const filteredAndroidApps = useMemo(() => {
    const base = androidApps.filter(app => !excludedBundleIds.has(app.bundleId));
    if (!searchQuery.trim()) return base;
    const query = searchQuery.toLowerCase();
    return base.filter(app =>
      app.name.toLowerCase().includes(query) ||
      app.bundleId.toLowerCase().includes(query)
    );
  }, [searchQuery, androidApps, excludedBundleIds]);

  // Filter iTunes results to exclude apps already in recommended
  const filteredITunesResults = useMemo(() => {
    if (!isIOS || searchQuery.trim().length < 2) return [];

    const recommendedBundleIds = new Set(recommendedApps.map(app => app.bundleId));
    return iTunesResults.filter(app =>
      !recommendedBundleIds.has(app.bundleId) && !excludedBundleIds.has(app.bundleId)
    );
  }, [isIOS, searchQuery, iTunesResults, recommendedApps, excludedBundleIds]);

  // Combined apps list for display
  const filteredApps = useMemo(() => {
    if (!isIOS) {
      // On Android, show filtered installed apps
      return filteredAndroidApps;
    }

    // On iOS: combine matching recommended apps + iTunes results
    if (searchQuery.trim().length >= 2) {
      return [...filteredRecommendedApps, ...filteredITunesResults];
    }

    // No search: show only recommended apps
    return filteredRecommendedApps;
  }, [searchQuery, isIOS, filteredAndroidApps, filteredRecommendedApps, filteredITunesResults]);

  const renderAppItem = ({ item, index }: { item: AppInfo; index: number }) => (
    <>
      <TouchableOpacity
        style={styles.appItem}
        onPress={() => onSelectApp(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.appIcon, !item.iconUrl && { backgroundColor: getAppColor(item.bundleId) }]}>
          {item.iconUrl ? (
            <Image source={{ uri: item.iconUrl }} style={styles.appIconImage} />
          ) : (
            <Text style={styles.appIconText}>{item.name.charAt(0)}</Text>
          )}
        </View>
        <View style={styles.appInfo}>
          <Text style={styles.appName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.bundleId} numberOfLines={1}>{item.bundleId}</Text>
        </View>
        <Ionicons name="add-circle" size={24} color={colors.accent} />
      </TouchableOpacity>
      {renderItemSeparator(index)}
    </>
  );

  const renderEmptyState = () => {
    // Don't show empty state while searching or loading Android apps
    if (isSearching || isLoadingAndroidApps) return null;

    // Show error state if there was a search error
    if (searchError) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.emptyText}>{searchError}</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Ionicons name="search-outline" size={48} color={colors.textMuted} />
        <Text style={styles.emptyText}>
          {isIOS && searchQuery.length >= 2
            ? 'No apps found matching your search'
            : isIOS && searchQuery.length > 0
              ? 'Type at least 2 characters to search the App Store'
              : isIOS
                ? 'Search for apps from the App Store'
                : searchQuery.length > 0
                  ? 'No apps found matching your search'
                  : 'No installed apps found'}
        </Text>
      </View>
    );
  };

  const renderListHeader = () => {
    if (!isIOS) return null;

    // Show "Recommended Apps" header when we have recommended apps to show
    if (recommendedApps.length > 0 && (searchQuery.trim().length < 2 || filteredRecommendedApps.length > 0)) {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recommended Apps</Text>
        </View>
      );
    }

    // If searching but no recommended matches, show iTunes results header
    if (searchQuery.trim().length >= 2 && filteredITunesResults.length > 0) {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>App Store Results</Text>
        </View>
      );
    }

    return null;
  };

  // Render a separator between recommended and iTunes results
  const renderItemSeparator = (index: number) => {
    // Show "App Store Results" header after the last recommended app
    if (isIOS &&
      searchQuery.trim().length >= 2 &&
      filteredRecommendedApps.length > 0 &&
      filteredITunesResults.length > 0 &&
      index === filteredRecommendedApps.length - 1) {
      return (
        <View style={styles.sectionDivider}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>App Store Results</Text>
          </View>
        </View>
      );
    }
    return null;
  };

  const renderFooter = () => {
    if (!isIOS || searchQuery.trim().length < 2) return null;

    if (isLoadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.footerText}>Loading more apps...</Text>
        </View>
      );
    }

    if (!hasMoreResults && iTunesResults.length > 0) {
      return (
        <View style={styles.footerLoader}>
          <Text style={styles.footerText}>No more results</Text>
        </View>
      );
    }

    return null;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={styles.modalContent}>
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            {/* Handle bar */}
            <View style={styles.handleBar} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Add App</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Subtitle */}
            <Text style={styles.subtitle}>
              {isIOS
                ? 'Search for apps from the App Store'
                : 'Select from your installed apps'}
            </Text>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={isIOS ? "Search App Store..." : "Filter apps..."}
                placeholderTextColor={colors.placeholder}
                value={searchQuery}
                onChangeText={handleSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => {
                  setSearchQuery('');
                  setITunesResults([]);
                  setSearchError(null);
                  setHasMoreResults(true);
                  setCurrentOffset(0);
                  currentSearchRef.current = '';
                  if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                  }
                }}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Loading indicator */}
            {(isSearching || isLoadingAndroidApps) && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.loadingText}>
                  {isIOS ? 'Searching App Store...' : 'Loading installed apps...'}
                </Text>
              </View>
            )}

            {/* App List */}
            <FlatList
              data={filteredApps}
              keyExtractor={(item, index) => `${item.bundleId}-${index}`}
              renderItem={renderAppItem}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={renderListHeader}
              ListEmptyComponent={renderEmptyState}
              ListFooterComponent={renderFooter}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onEndReached={loadMoreResults}
              onEndReachedThreshold={0.3}
            />
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    height: SCREEN_HEIGHT * 0.85,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  safeArea: {
    flex: 1,
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
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  appItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  appIconImage: {
    width: '100%',
    height: '100%',
  },
  appIconText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  appInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  appName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  bundleId: {
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  footerText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  sectionHeader: {
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionDivider: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
