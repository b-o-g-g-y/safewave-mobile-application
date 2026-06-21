import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ImageBackground,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';
import { FirestoreService } from '../../services/firebase/FirestoreService';
import { HistoryDocument } from '../../types/user';

// Extended type with converted date
interface HistoryItem {
  id: string;
  appName: string;
  bundleId: string;
  message: string;
  title: string;
  body: string;
  filtered: boolean;
  date: Date;
}

// Helper to format relative time
const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Helper to format an absolute date/time for the detail view
const formatFullDateTime = (date: Date): string => {
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Helper to get date group label
const getDateGroup = (date: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (itemDate.getTime() === today.getTime()) return 'Today';
  if (itemDate.getTime() === yesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};

// Get first letter for avatar
const getInitial = (name: string): string => {
  return name.charAt(0).toUpperCase();
};

// Get color for app avatar
const getAppColor = (bundleId: string): string => {
  const colors = ['#4A154B', '#25D366', '#464EB8', '#FF6B6B', '#4ECDC4', '#45B7D1'];
  let hash = 0;
  for (let i = 0; i < bundleId.length; i++) {
    hash = bundleId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

interface GroupedHistory {
  title: string;
  data: HistoryItem[];
}

export const HistoryScreen: React.FC = () => {
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

  // Subscribe to history from Firebase
  useEffect(() => {
    if (!user?.uid) {
      setHistory([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = FirestoreService.subscribeToHistory(user.uid, (historyDocs) => {
      // Convert Firebase documents to HistoryItems with Date objects
      const items: HistoryItem[] = historyDocs.map((doc) => ({
        id: doc.id || '',
        appName: doc.appName,
        bundleId: doc.bundleIdentifier,
        message: doc.message,
        title: doc.title ?? '',
        body: doc.body ?? '',
        filtered: doc.filtered === true,
        date: doc.date ? doc.date.toDate() : new Date(),
      }));
      setHistory(items);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Group history by date
  const groupedHistory = useMemo((): GroupedHistory[] => {
    const groups: { [key: string]: HistoryItem[] } = {};

    history.forEach(item => {
      const group = getDateGroup(item.date);
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(item);
    });

    return Object.entries(groups).map(([title, data]) => ({
      title,
      data: data.sort((a, b) => b.date.getTime() - a.date.getTime()),
    }));
  }, [history]);

  const handleRefresh = async () => {
    if (!user?.uid) return;

    setRefreshing(true);
    try {
      // Fetch fresh data from Firebase
      const historyDocs = await FirestoreService.getHistory(user.uid);
      const items: HistoryItem[] = historyDocs.map((doc) => ({
        id: doc.id || '',
        appName: doc.appName,
        bundleId: doc.bundleIdentifier,
        message: doc.message,
        title: doc.title ?? '',
        body: doc.body ?? '',
        filtered: doc.filtered === true,
        date: doc.date ? doc.date.toDate() : new Date(),
      }));
      setHistory(items);
    } catch (error) {
      console.error('Failed to refresh history:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const renderHistoryItem = (item: HistoryItem) => {
    const hasBody = item.body.length > 0;
    return (
      <TouchableOpacity
        style={styles.historyItem}
        onPress={() => setSelectedItem(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.appAvatar, { backgroundColor: getAppColor(item.bundleId) }]}>
          <Text style={styles.appAvatarText}>{getInitial(item.appName)}</Text>
        </View>
        <View style={styles.historyContent}>
          <View style={styles.historyHeader}>
            <Text style={styles.appName}>{item.appName}</Text>
            <Text style={styles.timestamp}>{formatRelativeTime(item.date)}</Text>
          </View>
          <Text style={styles.message} numberOfLines={1}>
            {item.message}
          </Text>
          {hasBody && (
            <Text style={styles.bodyPreview} numberOfLines={2}>
              {item.body}
            </Text>
          )}
          {item.filtered && (
            <View style={styles.filteredBadge}>
              <Ionicons name="notifications-off-outline" size={12} color={colors.textMuted} />
              <Text style={styles.filteredBadgeText}>Filtered (no buzz)</Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="time-outline" size={64} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>No History Yet</Text>
      <Text style={styles.emptySubtitle}>
        Notification alerts will appear here when your band responds to them
      </Text>
    </View>
  );

  // Flatten grouped data for FlatList
  const flatData = useMemo(() => {
    const result: (HistoryItem | { type: 'header'; title: string })[] = [];
    groupedHistory.forEach(group => {
      result.push({ type: 'header', title: group.title });
      group.data.forEach(item => result.push(item));
    });
    return result;
  }, [groupedHistory]);

  return (
    <ImageBackground
      source={require('../../../assets/images/background.png')}
      style={styles.background}
      resizeMode="cover">
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>History</Text>
            <Text style={styles.headerSubtitle}>
              Recent notification alerts
            </Text>
          </View>

          {/* History List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>Loading history...</Text>
            </View>
          ) : (
            <FlatList
              data={flatData}
              keyExtractor={(item, index) =>
                'type' in item ? `header-${item.title}` : item.id
              }
              renderItem={({ item }) =>
                'type' in item
                  ? renderSectionHeader(item.title)
                  : renderHistoryItem(item)
              }
              contentContainerStyle={[
                styles.listContent,
                history.length === 0 && styles.listContentEmpty,
              ]}
              ListEmptyComponent={renderEmptyState}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.accent}
                  colors={[colors.accent]}
                />
              }
            />
          )}
        </View>
      </SafeAreaView>

      {/* Notification detail */}
      <Modal
        visible={selectedItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedItem(null)}
      >
        <TouchableWithoutFeedback onPress={() => setSelectedItem(null)}>
          <View style={styles.detailOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.detailContent}>
                <SafeAreaView edges={['bottom']}>
                  <View style={styles.detailHandle} />

                  {selectedItem && (
                    <>
                      {/* App header */}
                      <View style={styles.detailAppRow}>
                        <View
                          style={[
                            styles.appAvatar,
                            { backgroundColor: getAppColor(selectedItem.bundleId) },
                          ]}
                        >
                          <Text style={styles.appAvatarText}>
                            {getInitial(selectedItem.appName)}
                          </Text>
                        </View>
                        <View style={styles.detailAppInfo}>
                          <Text style={styles.detailAppName}>{selectedItem.appName}</Text>
                          <Text style={styles.detailTime}>
                            {formatFullDateTime(selectedItem.date)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setSelectedItem(null)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>

                      {/* Status pill */}
                      <View
                        style={[
                          styles.statusPill,
                          selectedItem.filtered ? styles.statusPillFiltered : styles.statusPillBuzzed,
                        ]}
                      >
                        <Ionicons
                          name={selectedItem.filtered ? 'notifications-off-outline' : 'pulse'}
                          size={14}
                          color={selectedItem.filtered ? colors.textMuted : colors.accent}
                        />
                        <Text
                          style={[
                            styles.statusPillText,
                            { color: selectedItem.filtered ? colors.textMuted : colors.accent },
                          ]}
                        >
                          {selectedItem.filtered ? 'Filtered — band did not vibrate' : 'Band vibrated'}
                        </Text>
                      </View>

                      {/* Content */}
                      <ScrollView
                        style={styles.detailScroll}
                        contentContainerStyle={styles.detailScrollContent}
                        showsVerticalScrollIndicator={false}
                      >
                        <Text style={styles.detailTitle}>
                          {selectedItem.title || selectedItem.message}
                        </Text>
                        {selectedItem.body.length > 0 ? (
                          <Text style={styles.detailBody}>{selectedItem.body}</Text>
                        ) : (
                          <Text style={styles.detailNoBody}>
                            No additional details were captured for this notification.
                          </Text>
                        )}
                      </ScrollView>
                    </>
                  )}
                </SafeAreaView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  sectionHeader: {
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  appAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  appAvatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  historyContent: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  appName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  timestamp: {
    fontSize: 12,
    color: colors.textMuted,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  bodyPreview: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  chevron: {
    alignSelf: 'center',
    marginLeft: spacing.xs,
  },
  filteredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  filteredBadgeText: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 4,
    fontStyle: 'italic',
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
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  detailContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    maxHeight: '80%',
  },
  detailHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.textMuted,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  detailAppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  detailAppInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  detailAppName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  detailTime: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.round,
    marginBottom: spacing.md,
  },
  statusPillBuzzed: {
    backgroundColor: `${colors.accent}20`,
  },
  statusPillFiltered: {
    backgroundColor: colors.surfaceLight,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  detailScroll: {
    flexShrink: 1,
  },
  detailScrollContent: {
    paddingBottom: spacing.sm,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  detailBody: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  detailNoBody: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 20,
  },
});
