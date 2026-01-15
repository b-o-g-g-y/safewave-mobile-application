import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';

interface LogoProps {
  showIcon?: boolean;
  showText?: boolean;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

export const Logo: React.FC<LogoProps> = ({
  showIcon = true,
  showText = true,
  size = 'large',
  style,
}) => {
  const getIconSize = () => {
    switch (size) {
      case 'small':
        return { width: 50, height: 50 };
      case 'medium':
        return { width: 80, height: 80 };
      default:
        return { width: 100, height: 100 };
    }
  };

  const getTextSize = () => {
    switch (size) {
      case 'small':
        return { width: 120, height: 38 };
      case 'medium':
        return { width: 180, height: 52 };
      default:
        return { width: 260, height: 65 };
    }
  };

  return (
    <View style={[styles.container, style]}>
      {showIcon && (
        <Image
          source={require('../../assets/images/logo.png')}
          style={[styles.icon, getIconSize()]}
          resizeMode="contain"
        />
      )}
      {showText && (
        <Image
          source={require('../../assets/images/logoName.png')}
          style={[styles.text, getTextSize()]}
          resizeMode="contain"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginBottom: 8,
  },
  text: {},
});
