const { withDangerousMod, withMainApplication, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Creates the BLEForegroundService.java, BLEForegroundServiceModule.java,
 * and BLEForegroundServicePackage.java files
 */
function createForegroundServiceFiles(config, projectRoot) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const packageName = config.android?.package || 'com.safewave.forbusiness';
      const packagePath = packageName.replace(/\./g, '/');

      const javaDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        packagePath
      );

      // Create directory if it doesn't exist
      if (!fs.existsSync(javaDir)) {
        fs.mkdirSync(javaDir, { recursive: true });
      }

      // ==================== BLEForegroundService.java ====================
      const serviceContent = `package ${packageName};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

/**
 * Foreground service that keeps the app process alive while maintaining
 * a BLE connection to the Safewave Band in the background.
 *
 * Shows a persistent notification so Android does not kill the process.
 */
public class BLEForegroundService extends Service {
    private static final String TAG = "BLEForegroundService";
    public static final String CHANNEL_ID = "safewave_ble_channel";
    private static final int NOTIFICATION_ID = 9001;
    private static final String PREFS_NAME = "BLEForegroundServicePrefs";
    private static final String PREF_BAND_NAME = "band_name";
    private static final String PREF_STATUS = "status";
    private static final String PREF_WAS_RUNNING = "was_running";

    public static final String ACTION_START = "com.safewave.action.START_BLE_SERVICE";
    public static final String ACTION_STOP = "com.safewave.action.STOP_BLE_SERVICE";
    public static final String ACTION_UPDATE = "com.safewave.action.UPDATE_BLE_SERVICE";
    public static final String EXTRA_BAND_NAME = "band_name";
    public static final String EXTRA_STATUS = "status";

    private String currentBandName = "Safewave Band";
    private String currentStatus = "connected";
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Service created");
        createNotificationChannel();

        // Acquire a partial wake lock to prevent the CPU from sleeping
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "safewave:BLEService");
            wakeLock.acquire();
            Log.d(TAG, "Wake lock acquired");
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            // Android restarted the service after killing the process.
            // Restore state from SharedPreferences and stay alive so the
            // React Native app can re-initialize and reconnect.
            Log.w(TAG, "Service restarted with null intent — restoring state");
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            boolean wasRunning = prefs.getBoolean(PREF_WAS_RUNNING, false);

            if (!wasRunning) {
                Log.d(TAG, "Service was not previously running, stopping");
                stopSelf();
                return START_NOT_STICKY;
            }

            currentBandName = prefs.getString(PREF_BAND_NAME, "Safewave Band");
            currentStatus = "reconnecting";

            Log.d(TAG, "Restoring foreground service for: " + currentBandName);
            Notification notification = buildNotification();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }

            return START_STICKY;
        }

        String action = intent.getAction();

        if (ACTION_STOP.equals(action)) {
            Log.d(TAG, "Stopping foreground service");
            saveState(false);
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        // Extract extras
        String bandName = intent.getStringExtra(EXTRA_BAND_NAME);
        String status = intent.getStringExtra(EXTRA_STATUS);

        if (bandName != null) {
            currentBandName = bandName;
        }
        if (status != null) {
            currentStatus = status;
        }

        if (ACTION_START.equals(action)) {
            Log.d(TAG, "Starting foreground service for: " + currentBandName);
            saveState(true);
            Notification notification = buildNotification();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Android 14+ requires foregroundServiceType
                startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } else if (ACTION_UPDATE.equals(action)) {
            Log.d(TAG, "Updating notification: " + currentStatus + " - " + currentBandName);
            saveState(true);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, buildNotification());
            }
        }

        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "Service destroyed");
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            Log.d(TAG, "Wake lock released");
        }
        super.onDestroy();
    }

    /**
     * Persist the current service state so it can be restored after
     * Android kills and restarts the process.
     */
    private void saveState(boolean running) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit()
            .putBoolean(PREF_WAS_RUNNING, running)
            .putString(PREF_BAND_NAME, currentBandName)
            .putString(PREF_STATUS, currentStatus)
            .apply();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Safewave Band Connection",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps the Safewave Band connected in the background");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
                Log.d(TAG, "Notification channel created");
            }
        }
    }

    private Notification buildNotification() {
        // Create an intent to open the app when the notification is tapped
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pendingIntent = null;
        if (launchIntent != null) {
            pendingIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        String title;
        String text;

        switch (currentStatus) {
            case "reconnecting":
                title = "Reconnecting...";
                text = "Looking for " + currentBandName;
                break;
            case "connected":
            default:
                title = "Connected to " + currentBandName;
                text = "Safewave is monitoring your band";
                break;
        }

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        builder.setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .setOnlyAlertOnce(true);

        if (pendingIntent != null) {
            builder.setContentIntent(pendingIntent);
        }

        return builder.build();
    }
}
`;

      fs.writeFileSync(path.join(javaDir, 'BLEForegroundService.java'), serviceContent);
      console.log('✅ BLEForegroundService.java created successfully');

      // ==================== BLEForegroundServiceModule.java ====================
      const moduleContent = `package ${packageName};

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * React Native native module to start/stop the BLE foreground service
 * from JavaScript.
 */
public class BLEForegroundServiceModule extends ReactContextBaseJavaModule {
    private static final String TAG = "BLEForegroundService";

    public BLEForegroundServiceModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "BLEForegroundService";
    }

    /**
     * Start the foreground service with the connected band name.
     * Called from JS when a BLE connection is established.
     */
    @ReactMethod
    public void startService(String bandName) {
        Log.d(TAG, "startService called with bandName: " + bandName);
        try {
            Context context = getReactApplicationContext();
            Intent intent = new Intent(context, BLEForegroundService.class);
            intent.setAction(BLEForegroundService.ACTION_START);
            intent.putExtra(BLEForegroundService.EXTRA_BAND_NAME, bandName);
            intent.putExtra(BLEForegroundService.EXTRA_STATUS, "connected");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            Log.d(TAG, "Foreground service started");
        } catch (Exception e) {
            Log.e(TAG, "Error starting foreground service", e);
        }
    }

    /**
     * Update the notification text (e.g. when reconnecting).
     * Called from JS when BLE state changes.
     */
    @ReactMethod
    public void updateService(String bandName, String status) {
        Log.d(TAG, "updateService called: " + status + " - " + bandName);
        try {
            Context context = getReactApplicationContext();
            Intent intent = new Intent(context, BLEForegroundService.class);
            intent.setAction(BLEForegroundService.ACTION_UPDATE);
            intent.putExtra(BLEForegroundService.EXTRA_BAND_NAME, bandName);
            intent.putExtra(BLEForegroundService.EXTRA_STATUS, status);

            context.startService(intent);
            Log.d(TAG, "Foreground service updated");
        } catch (Exception e) {
            Log.e(TAG, "Error updating foreground service", e);
        }
    }

    /**
     * Stop the foreground service.
     * Called from JS when BLE is disconnected or user logs out.
     */
    @ReactMethod
    public void stopService() {
        Log.d(TAG, "stopService called");
        try {
            Context context = getReactApplicationContext();
            Intent intent = new Intent(context, BLEForegroundService.class);
            intent.setAction(BLEForegroundService.ACTION_STOP);
            context.startService(intent);
            Log.d(TAG, "Foreground service stop requested");
        } catch (Exception e) {
            Log.e(TAG, "Error stopping foreground service", e);
        }
    }
}
`;

      fs.writeFileSync(path.join(javaDir, 'BLEForegroundServiceModule.java'), moduleContent);
      console.log('✅ BLEForegroundServiceModule.java created successfully');

      // ==================== BLEForegroundServicePackage.java ====================
      const packageFileContent = `package ${packageName};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Package to register BLEForegroundServiceModule with React Native
 */
public class BLEForegroundServicePackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new BLEForegroundServiceModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
`;

      fs.writeFileSync(path.join(javaDir, 'BLEForegroundServicePackage.java'), packageFileContent);
      console.log('✅ BLEForegroundServicePackage.java created successfully');

      return config;
    },
  ]);
}

/**
 * Add the foreground service and permissions to AndroidManifest.xml
 */
function addToManifest(androidManifest) {
  const { manifest } = androidManifest;

  // ---- Add permissions ----
  if (!manifest['uses-permission']) {
    manifest['uses-permission'] = [];
  }

  const permissionsToAdd = [
    'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
    'android.permission.WAKE_LOCK',
  ];

  for (const perm of permissionsToAdd) {
    const exists = manifest['uses-permission'].some(
      (p) => p.$?.['android:name'] === perm
    );
    if (!exists) {
      manifest['uses-permission'].push({
        $: { 'android:name': perm },
      });
      console.log('✅ Permission added:', perm);
    }
  }

  // ---- Add service declaration ----
  if (!manifest.application) {
    manifest.application = [];
  }

  const application = manifest.application[0];

  if (!application.service) {
    application.service = [];
  }

  const serviceExists = application.service.some(
    (service) => service.$?.['android:name'] === '.BLEForegroundService'
  );

  if (!serviceExists) {
    application.service.push({
      $: {
        'android:name': '.BLEForegroundService',
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:foregroundServiceType': 'connectedDevice',
      },
    });
    console.log('✅ BLEForegroundService added to AndroidManifest');
  }

  return androidManifest;
}

/**
 * Register BLEForegroundServicePackage in MainApplication
 */
function updateMainApplication(config) {
  return withMainApplication(config, (config) => {
    const { modResults } = config;
    const { contents } = modResults;

    // Check if package is already registered
    if (contents.includes('BLEForegroundServicePackage')) {
      console.log('⚠️  BLEForegroundServicePackage already registered in MainApplication');
      return config;
    }

    const packageName = config.android?.package || 'com.safewave.forbusiness';
    const isKotlin = modResults.language === 'kt' || contents.includes('class MainApplication');

    if (isKotlin) {
      // Kotlin MainApplication
      const ktImport = `import ${packageName}.BLEForegroundServicePackage`;

      // Add import after the last import line (Kotlin imports have no semicolon)
      const ktImportRegex = /import\s+[\w.]+/g;
      const imports = contents.match(ktImportRegex);
      if (imports && imports.length > 0) {
        const lastImport = imports[imports.length - 1];
        const lastImportIndex = contents.lastIndexOf(lastImport);
        const insertPosition = lastImportIndex + lastImport.length;

        modResults.contents =
          contents.slice(0, insertPosition) +
          '\n' + ktImport +
          contents.slice(insertPosition);
      }

      // Add package to getPackages() - Kotlin uses add(ClassName()) without "new"
      const ktAddRegex = /add\(\w+Package\(\)\)/;
      const ktMatch = modResults.contents.match(ktAddRegex);

      if (ktMatch) {
        const insertPosition = modResults.contents.indexOf(ktMatch[0]) + ktMatch[0].length;
        modResults.contents =
          modResults.contents.slice(0, insertPosition) +
          '\n              add(BLEForegroundServicePackage())' +
          modResults.contents.slice(insertPosition);

        console.log('✅ BLEForegroundServicePackage added to MainApplication (Kotlin)');
      } else {
        console.warn('⚠️  Could not find add() in Kotlin MainApplication - you may need to add it manually');
      }
    } else {
      // Java MainApplication
      const javaImport = `import ${packageName}.BLEForegroundServicePackage;`;

      const javaImportRegex = /import\s+[\w.]+;/g;
      const imports = contents.match(javaImportRegex);
      if (imports && imports.length > 0) {
        const lastImport = imports[imports.length - 1];
        const lastImportIndex = contents.lastIndexOf(lastImport);
        const insertPosition = lastImportIndex + lastImport.length;

        modResults.contents =
          contents.slice(0, insertPosition) +
          '\n' + javaImport +
          contents.slice(insertPosition);
      }

      const javaAddRegex = /packages\.add\(new\s+\w+Package\(\)\);/;
      const javaMatch = modResults.contents.match(javaAddRegex);

      if (javaMatch) {
        const insertPosition = modResults.contents.indexOf(javaMatch[0]) + javaMatch[0].length;
        modResults.contents =
          modResults.contents.slice(0, insertPosition) +
          '\n        packages.add(new BLEForegroundServicePackage());' +
          modResults.contents.slice(insertPosition);

        console.log('✅ BLEForegroundServicePackage added to MainApplication (Java)');
      } else {
        console.warn('⚠️  Could not find packages.add() in MainApplication - you may need to add it manually');
      }
    }

    return config;
  });
}

/**
 * Main plugin function
 */
const withBLEForegroundService = (config) => {
  const projectRoot = config._internal?.projectRoot || process.cwd();

  // 1. Create Java files
  config = createForegroundServiceFiles(config, projectRoot);

  // 2. Add service + permissions to AndroidManifest
  config = withAndroidManifest(config, (config) => {
    config.modResults = addToManifest(config.modResults);
    return config;
  });

  // 3. Register package in MainApplication
  config = updateMainApplication(config);

  return config;
};

module.exports = withBLEForegroundService;
