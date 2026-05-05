import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AccountScreen } from '../screens/account/AccountScreen';
import { HelpSupportScreen } from '../screens/account/HelpSupportScreen';
import { FirmwareUpdateScreen } from '../screens/account/FirmwareUpdateScreen';

export type AccountStackParamList = {
  AccountMain: undefined;
  HelpSupport: undefined;
  FirmwareUpdate: undefined;
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
      <Stack.Screen name="FirmwareUpdate" component={FirmwareUpdateScreen} />
    </Stack.Navigator>
  );
};
