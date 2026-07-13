import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

// Must be registered before registerRootComponent: on a cold background push,
// RN looks for the handler as soon as the bundle is evaluated.
import './src/services/alerts/registerBackgroundHandler';

import App from './App';

// Catch unhandled promise rejections globally to prevent silent crashes
const originalHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
if ((global as any).ErrorUtils) {
  (global as any).ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    console.error('[GlobalError]', isFatal ? 'FATAL:' : 'Error:', error?.message || error);
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });
}

// Suppress known non-critical warnings in production
LogBox.ignoreLogs([
  'This method is deprecated', // Firebase v22 migration warnings
]);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
