import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme/colors';

interface AppListItemProps {
  name: string;
  iconUrl: string;
  enabled: boolean;
  vibrations: number;
  strength: number;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Get color for app avatar based on bundle ID or name
const getAppColor = (name: string): string => {
  const appColors = ['#4A154B', '#25D366', '#464EB8', '#EA4335', '#0088CC', '#5865F2', '#0084FF', '#2C6BED'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return appColors[Math.abs(hash) % appColors.length];
};

export const AppListItem: React.FC<AppListItemProps> = ({
  name,
  iconUrl,
  enabled,
  vibrations,
  strength,
  onToggle,
  onEdit,
  onDelete,
}) => {
  const [imageError, setImageError] = useState(false);

  const handleDelete = () => {
    Alert.alert(
      'Remove App',
      `Are you sure you want to remove ${name} from your alerts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  // Get first letter for fallback avatar
  const getInitial = (appName: string): string => {
    return appName.charAt(0).toUpperCase();
  };

  const showFallback = !iconUrl || imageError;

  return (
    <TouchableOpacity 
      style={[styles.container, !enabled && styles.containerDisabled]} 
      onPress={onEdit}
      activeOpacity={0.7}
    >
      <View style={styles.leftSection}>
        {/* App Icon */}
        <View style={[styles.iconContainer, showFallback && { backgroundColor: getAppColor(name) }]}>
          {showFallback ? (
            <Text style={styles.iconFallbackText}>{getInitial(name)}</Text>
          ) : (
            <Image
              source={{ uri: iconUrl }}
              style={styles.appIcon}
              onError={() => setImageError(true)}
            />
          )}
        </View>

        {/* App Info */}
        <View style={styles.infoContainer}>
          <Text style={[styles.appName, !enabled && styles.textDisabled]}>
            {name}
          </Text>
          <View style={styles.configRow}>
            <View style={styles.configBadge}>
              <Ionicons 
                name="pulse" 
                size={12} 
                color={enabled ? colors.accent : colors.textMuted} 
              />
              <Text style={[styles.configText, !enabled && styles.textDisabled]}>
                {vibrations}x
              </Text>
            </View>
            <View style={styles.configBadge}>
              <Ionicons 
                name="flash" 
                size={12} 
                color={enabled ? colors.accent : colors.textMuted} 
              />
              <Text style={[styles.configText, !enabled && styles.textDisabled]}>
                {strength}%
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.rightSection}>
        {/* Delete Button */}
        <TouchableOpacity 
          style={styles.deleteButton} 
          onPress={handleDelete}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </TouchableOpacity>

        {/* Toggle Switch */}
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: colors.surfaceLight, true: colors.accent }}
          thumbColor={colors.textPrimary}
          ios_backgroundColor={colors.surfaceLight}
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  containerDisabled: {
    opacity: 0.6,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLight,
    marginRight: spacing.md,
  },
  appIcon: {
    width: '100%',
    height: '100%',
  },
  iconFallbackText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  infoContainer: {
    flex: 1,
  },
  appName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  textDisabled: {
    color: colors.textMuted,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  configBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  configText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
});
