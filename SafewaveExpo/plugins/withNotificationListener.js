const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Adds the NotificationListenerService to AndroidManifest.xml
 */
function addServiceToManifest(androidManifest) {
  const { manifest } = androidManifest;

  if (!manifest.application) {
    manifest.application = [];
  }

  const application = manifest.application[0];

  // Add the notification listener service
  if (!application.service) {
    application.service = [];
  }

  // Check if service already exists
  const serviceExists = application.service.some(
    (service) =>
      service.$?.['android:name'] === '.NotificationListener'
  );

  if (!serviceExists) {
    application.service.push({
      $: {
        'android:name': '.NotificationListener',
        'android:label': '@string/app_name',
        'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        'android:exported': 'false',
      },
      'intent-filter': [
        {
          action: [
            {
              $: {
                'android:name': 'android.service.notification.NotificationListenerService',
              },
            },
          ],
        },
      ],
    });
  }

  return androidManifest;
}

/**
 * Creates the NotificationListener.java file
 */
function createNotificationListenerJava(config, projectRoot) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const packageName = config.android?.package || 'com.safewave.forbusiness';
      const packagePath = packageName.replace(/\./g, '/');
      
      const mainApplicationPath = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        packagePath
      );

      // Create directory if it doesn't exist
      if (!fs.existsSync(mainApplicationPath)) {
        fs.mkdirSync(mainApplicationPath, { recursive: true });
      }

      const notificationListenerPath = path.join(
        mainApplicationPath,
        'NotificationListener.java'
      );

      const notificationListenerContent = `package ${packageName};

import android.content.Intent;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.bridge.ReactContext;

/**
 * NotificationListenerService that intercepts all notifications
 * and sends them to React Native for processing
 */
public class NotificationListener extends NotificationListenerService {
    private static final String TAG = "NotificationListener";
    private static final String EVENT_NAME = "onNotificationPosted";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String packageName = sbn.getPackageName();
            
            // Don't process our own app's notifications
            if (packageName.equals(getPackageName())) {
                return;
            }

            Log.d(TAG, "Notification received from: " + packageName);

            // Send event to React Native
            sendEventToReactNative(packageName);
        } catch (Exception e) {
            Log.e(TAG, "Error processing notification", e);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // We don't need to handle removed notifications
    }

    private void sendEventToReactNative(String packageName) {
        try {
            ReactApplication reactApplication = (ReactApplication) getApplication();
            ReactInstanceManager reactInstanceManager = reactApplication.getReactNativeHost().getReactInstanceManager();
            ReactContext reactContext = reactInstanceManager.getCurrentReactContext();

            if (reactContext != null) {
                WritableMap params = Arguments.createMap();
                params.putString("packageName", packageName);
                params.putDouble("timestamp", System.currentTimeMillis());

                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(EVENT_NAME, params);
                
                Log.d(TAG, "Event sent to React Native: " + packageName);
            } else {
                Log.w(TAG, "React context not available, cannot send event");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error sending event to React Native", e);
        }
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.d(TAG, "NotificationListener connected");
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.d(TAG, "NotificationListener disconnected");
        
        // Try to reconnect
        Intent intent = new Intent(this, NotificationListener.class);
        startService(intent);
    }
}
`;

      // Write the file
      fs.writeFileSync(notificationListenerPath, notificationListenerContent);
      console.log('✅ NotificationListener.java created successfully');

      return config;
    },
  ]);
}

/**
 * Main plugin function
 */
const withNotificationListener = (config) => {
  // Add service to AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    config.modResults = addServiceToManifest(config.modResults);
    return config;
  });

  // Create the Java file
  config = createNotificationListenerJava(config, config._internal?.projectRoot || process.cwd());

  return config;
};

module.exports = withNotificationListener;
