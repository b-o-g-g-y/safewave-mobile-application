import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';

interface LogoProps {
  showIcon?: boolean;
  showText?: boolean;
  size?: 'small' | 'medium' | 'large';
  layout?: 'vertical' | 'horizontal';
  style?: ViewStyle;
}

export const Logo: React.FC<LogoProps> = ({
  showIcon = true,
  showText = true,
  size = 'large',
  layout = 'vertical',
  style,
}) => {
  const getIconSize = () => {
    switch (size) {
      case 'small':
        return { width: 44, height: 44 };
      case 'medium':
        return { width: 56, height: 56 };
      default:
        return { width: 100, height: 100 };
    }
  };

  const getTextSize = () => {
    // Width/height for logoName text image
    switch (size) {
      case 'small':
        return { width: 160, height: 44 }; // Match icon height
      case 'medium':
        return { width: 200, height: 56 };
      default:
        return { width: 360, height: 100 };
    }
  };

  const isHorizontal = layout === 'horizontal';

  return (
    <View style={[
      styles.container, 
      isHorizontal && styles.containerHorizontal,
      style
    ]}>
      {showIcon && (
        <Image
          source={require('../../assets/images/logo.png')}
          style={[
            styles.icon, 
            getIconSize(),
            isHorizontal ? styles.iconHorizontal : styles.iconVertical,
          ]}
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
  containerHorizontal: {
    flexDirection: 'row',
  },
  icon: {},
  iconVertical: {
    marginBottom: 8,
  },
  iconHorizontal: {
    marginRight: 8,
  },
  text: {},
});
