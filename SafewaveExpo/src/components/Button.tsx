import React, { ReactNode } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  Image,
  ImageSourcePropType,
  View,
} from 'react-native';
import { colors, borderRadius, spacing } from '../theme/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'google' | 'apple' | 'text';
  icon?: ImageSourcePropType;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  children?: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  icon,
  style,
  textStyle,
  disabled = false,
  children,
}) => {
  const getButtonStyle = (): ViewStyle => {
    switch (variant) {
      case 'google':
        return styles.googleButton;
      case 'apple':
        return styles.appleButton;
      case 'text':
        return styles.textButton;
      default:
        return styles.primaryButton;
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'google':
        return styles.googleText;
      case 'apple':
        return styles.appleText;
      case 'text':
        return styles.linkText;
      default:
        return styles.primaryText;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, getButtonStyle(), disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}>
      <View style={styles.content}>
        {icon && <Image source={icon} style={styles.icon} resizeMode="contain" />}
        {title ? (
          <Text style={[getTextStyle(), textStyle]}>{title}</Text>
        ) : (
          children
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 20,
    height: 20,
    marginRight: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.accent,
  },
  primaryText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: colors.buttonGoogle,
  },
  googleText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '500',
  },
  appleButton: {
    backgroundColor: colors.buttonApple,
  },
  appleText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  textButton: {
    backgroundColor: colors.transparent,
    paddingVertical: spacing.xs,
  },
  linkText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.5,
  },
});
