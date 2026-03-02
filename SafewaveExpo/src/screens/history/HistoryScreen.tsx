import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ImageBackground,
  RefreshControl,
  ActivityIndicator,
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
        date: doc.date?.toDate() || new Date(),
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
        date: doc.date?.toDate() || new Date(),
      }));
      setHistory(items);
    } catch (error) {
      console.error('Failed to refresh history:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const renderHistoryItem = (item: HistoryItem) => (
    <View style={styles.historyItem}>
      <View style={[styles.appAvatar, { backgroundColor: getAppColor(item.bundleId) }]}>
        <Text style={styles.appAvatarText}>{getInitial(item.appName)}</Text>
      </View>
      <View style={styles.historyContent}>
        <View style={styles.historyHeader}>
          <Text style={styles.appName}>{item.appName}</Text>
          <Text style={styles.timestamp}>{formatRelativeTime(item.date)}</Text>
        </View>
        <Text style={styles.message} numberOfLines={2}>
          {item.message}
        </Text>
      </View>
    </View>
  );

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
    color: colors.textSecondary,
    lineHeight: 20,
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
});
