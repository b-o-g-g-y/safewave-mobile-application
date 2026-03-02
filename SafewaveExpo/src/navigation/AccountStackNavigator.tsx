import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AccountScreen } from '../screens/account/AccountScreen';
import { HelpSupportScreen } from '../screens/account/HelpSupportScreen';

export type AccountStackParamList = {
  AccountMain: undefined;
  HelpSupport: undefined;
};

const Stack = createNativeStackNavigator<AccountStackParamList>();

export const AccountStackNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="AccountMain" component={AccountScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
    </Stack.Navigator>
  );
};
