import React from 'react';
import { StyleSheet, Platform, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeScreen } from '../screens/home/HomeScreen';
import { AlertsScreen } from '../screens/alerts/AlertsScreen';
import { HistoryScreen } from '../screens/history/HistoryScreen';
import { AccountStackNavigator } from './AccountStackNavigator';
import { colors } from '../theme/colors';
import { useBluetoothStore } from '../store/bluetoothStore';

export type MainTabParamList = {
  Home: undefined;
  Alerts: undefined;
  History: undefined;
  Account: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const firmwareUpdateAvailable = useBluetoothStore(
    (s) => s.firmwareUpdateAvailable
  );

  // Add extra padding for Android
  const extraPadding = Platform.OS === 'android' ? 12 : 8;
  const minPadding = Platform.OS === 'android' ? 20 : 16;
  
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          ...styles.tabBar,
          paddingBottom: Math.max(insets.bottom + extraPadding, minPadding),
          height: 56 + Math.max(insets.bottom + extraPadding, minPadding),
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabBarLabel,
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          tabBarLabel: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountStackNavigator}
        options={{
          tabBarLabel: 'Account',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="person-circle-outline" size={size} color={color} />
              {firmwareUpdateAvailable && <View style={styles.badgeDot} />}
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.warning,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
