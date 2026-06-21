const APP_VARIANT = process.env.APP_VARIANT ?? 'business';

const variants = {
  business: {
    name: 'Safewave for Business',
    version: '1.0.1',
    iosBuildNumber: '5',
    androidVersionCode: 5,
    iosBundleId: 'com.safewave.forbusiness',
    androidPackage: 'com.safewave.forbusiness',
    googleServicesIos: './firebase/GoogleService-Info.plist',
    googleServicesAndroid: './firebase/google-services.json',
    bgTaskIdentifier: 'com.safewave.forbusiness.refresh',
    icon: './assets/icon.png',
    adaptiveIconForeground: './assets/adaptive-icon.png',
    extraInfoPlist: {},
  },
  consumer: {
    name: 'Safewave',
    version: '1.3.0',
    iosBuildNumber: '1',
    androidVersionCode: 16,
    iosBundleId: 'com.safewaveMobileApp',
    androidPackage: 'com.safewaveMobileApp',
    googleServicesIos: './firebase/GoogleService-Info.consumer.plist',
    googleServicesAndroid: './firebase/google-services.consumer.json',
    bgTaskIdentifier: 'com.safewaveMobileApp.refresh',
    icon: './assets/consumer/icon.png',
    adaptiveIconForeground: './assets/consumer/adaptive-icon.png',
    // Parity with the live Flutter consumer app: removing these on update
    // would silently revoke capabilities existing users rely on.
    extraInfoPlist: {
      UIBackgroundModes: ['bluetooth-central', 'fetch', 'remote-notification'],
      NSPhotoLibraryUsageDescription:
        'This app requires access to your photo library to allow you to select and upload photos for profile pictures.',
      NSUserNotificationsUsageDescription:
        "Safewave needs to send you notifications about your band's battery status and connection state.",
    },
  },
};

const v = variants[APP_VARIANT];
if (!v) {
  throw new Error(
    `Unknown APP_VARIANT="${APP_VARIANT}". Expected "business" or "consumer".`
  );
}

module.exports = {
  expo: {
    name: v.name,
    slug: 'SafewaveExpo',
    version: v.version,
    orientation: 'portrait',
    icon: v.icon,
    userInterfaceStyle: 'dark',
    newArchEnabled: false,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#00151E',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: v.iosBundleId,
      buildNumber: v.iosBuildNumber,
      googleServicesFile: v.googleServicesIos,
      usesAppleSignIn: true,
      infoPlist: {
        NSBluetoothAlwaysUsageDescription:
          'This app uses Bluetooth to connect to your Safewave Band',
        NSBluetoothPeripheralUsageDescription:
          'This app uses Bluetooth to connect to your Safewave Band',
        UIBackgroundModes: ['bluetooth-central'],
        BGTaskSchedulerPermittedIdentifiers: [v.bgTaskIdentifier],
        ITSAppUsesNonExemptEncryption: false,
        ...v.extraInfoPlist,
      },
      appleTeamId: 'VXLM9VZK85',
    },
    android: {
      package: v.androidPackage,
      versionCode: v.androidVersionCode,
      googleServicesFile: v.googleServicesAndroid,
      adaptiveIcon: {
        foregroundImage: v.adaptiveIconForeground,
        backgroundColor: '#00151E',
      },
      edgeToEdgeEnabled: true,
      permissions: [
        'android.permission.BLUETOOTH',
        'android.permission.BLUETOOTH_ADMIN',
        'android.permission.BLUETOOTH_CONNECT',
        'android.permission.BLUETOOTH_SCAN',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
        'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        'android.permission.QUERY_ALL_PACKAGES',
        // Background reliability: the FGS notification keeps the process
        // privileged (POST_NOTIFICATIONS), the battery-optimization exemption
        // stops OEMs from killing it, and the boot receiver restarts it after
        // a reboot. See plugins/withBLEForegroundService.js (BootReceiver) and
        // src/services/PermissionsService.ts (runtime grants).
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
        'android.permission.RECEIVE_BOOT_COMPLETED',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      './plugins/withFirebaseInit',
      './plugins/withDsym',
      './plugins/withNotificationListener',
      './plugins/withInstalledApps',
      './plugins/withBLEForegroundService',
      './plugins/withSafewaveSigning',
      [
        'expo-build-properties',
        {
          ios: {
            useFrameworks: 'static',
          },
        },
      ],
    ],
    extra: {
      variant: APP_VARIANT,
      eas: {
        projectId: 'db1c07f4-6c9a-4c86-b142-0f411383cef5',
      },
    },
  },
};
