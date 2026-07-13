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

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * React Native native module to start/stop the BLE foreground service
 * from JavaScript, and to check/request the OS-level grants that keep the
 * service alive (battery-optimization exemption, notification-listener
 * access) plus deep-link into OEM auto-start / protected-app screens.
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

    // ==================== Background wake-tick (Doze-piercing) ====================

    /**
     * Start the periodic AlarmManager wake-tick that survives Doze. Called from
     * JS when a BLE connection is established (alongside the foreground service).
     */
    @ReactMethod
    public void startBackgroundTicks() {
        Log.d(TAG, "startBackgroundTicks called");
        try {
            BackgroundTickReceiver.schedule(getReactApplicationContext());
        } catch (Exception e) {
            Log.e(TAG, "Error starting background ticks", e);
        }
    }

    /** Stop the wake-tick. Called on manual disconnect / logout. */
    @ReactMethod
    public void stopBackgroundTicks() {
        Log.d(TAG, "stopBackgroundTicks called");
        try {
            BackgroundTickReceiver.cancel(getReactApplicationContext());
        } catch (Exception e) {
            Log.e(TAG, "Error stopping background ticks", e);
        }
    }

    // ==================== Battery optimization exemption ====================

    /**
     * Whether this app is exempt from battery optimization (Doze allowlist).
     * When false, aggressive OEM power management may kill the foreground
     * service. Always resolves true below Android M (no optimization there).
     */
    @ReactMethod
    public void isIgnoringBatteryOptimizations(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true);
                return;
            }
            Context context = getReactApplicationContext();
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            boolean ignoring = pm != null
                && pm.isIgnoringBatteryOptimizations(context.getPackageName());
            promise.resolve(ignoring);
        } catch (Exception e) {
            Log.e(TAG, "isIgnoringBatteryOptimizations failed", e);
            promise.reject("ERR_BATTERY_OPT", e);
        }
    }

    /**
     * Show the system prompt asking the user to exclude this app from battery
     * optimization. Falls back to the battery-optimization list screen if the
     * direct request intent is unavailable on the device.
     */
    @ReactMethod
    public void requestIgnoreBatteryOptimizations(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true);
                return;
            }
            Context context = getReactApplicationContext();
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (intent.resolveActivity(context.getPackageManager()) != null) {
                context.startActivity(intent);
                promise.resolve(true);
                return;
            }
            // Fallback: the global battery-optimization list.
            Intent listIntent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            listIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(listIntent);
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "requestIgnoreBatteryOptimizations failed", e);
            promise.reject("ERR_BATTERY_OPT_REQUEST", e);
        }
    }

    // ==================== Notification-listener access ====================

    /**
     * Whether this app is currently granted notification-listener access.
     * Reads the system's enabled_notification_listeners setting and checks for
     * our package, so it reflects the real grant (unlike the optimistic JS flag).
     */
    @ReactMethod
    public void isNotificationListenerEnabled(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            String pkg = context.getPackageName();
            String flat = Settings.Secure.getString(
                context.getContentResolver(), "enabled_notification_listeners");
            boolean enabled = false;
            if (!TextUtils.isEmpty(flat)) {
                for (String name : flat.split(":")) {
                    ComponentName cn = ComponentName.unflattenFromString(name);
                    if (cn != null && pkg.equals(cn.getPackageName())) {
                        enabled = true;
                        break;
                    }
                }
            }
            promise.resolve(enabled);
        } catch (Exception e) {
            Log.e(TAG, "isNotificationListenerEnabled failed", e);
            promise.reject("ERR_NLS_CHECK", e);
        }
    }

    /**
     * Open the system notification-listener access settings screen.
     */
    @ReactMethod
    public void openNotificationListenerSettings(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "openNotificationListenerSettings failed", e);
            promise.reject("ERR_NLS_OPEN", e);
        }
    }

    // ==================== OEM auto-start / protected-app ====================

    /** Device manufacturer (lowercased), so JS can decide whether to show the OEM step. */
    @ReactMethod
    public void getManufacturer(Promise promise) {
        try {
            promise.resolve(Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        } catch (Exception e) {
            promise.reject("ERR_MANUFACTURER", e);
        }
    }

    /**
     * Best-effort deep-link into the OEM auto-start / protected-app manager.
     * The activities below vary by manufacturer and OS version, so each is
     * tried in turn and we fall back to this app's details screen if none
     * resolve. Resolves true if a known OEM screen opened, false if we landed
     * on the generic fallback (the JS layer uses this to tailor its guidance).
     */
    @ReactMethod
    public void openAutoStartSettings(Promise promise) {
        Context context = getReactApplicationContext();
        // (package, class) pairs for the known "don't kill my app" screens.
        String[][] components = new String[][] {
            {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
            {"com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity"},
            {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
            {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"},
            {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
            {"com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"},
            {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
            {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
            {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"},
            {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
            {"com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"},
            {"com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity"},
            {"com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"},
        };
        for (String[] c : components) {
            try {
                Intent intent = new Intent();
                intent.setComponent(new ComponentName(c[0], c[1]));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (intent.resolveActivity(context.getPackageManager()) != null) {
                    context.startActivity(intent);
                    promise.resolve(true);
                    return;
                }
            } catch (Exception ignored) {
                // Try the next candidate.
            }
        }
        // Fallback: this app's details page, where battery/auto-start toggles live.
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            promise.resolve(false);
        } catch (Exception e) {
            Log.e(TAG, "openAutoStartSettings fallback failed", e);
            promise.reject("ERR_AUTOSTART", e);
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

      // ==================== BootReceiver.java ====================
      const bootReceiverContent = `package ${packageName};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * Restarts the BLE foreground service after the device reboots, so the band
 * reconnects without the user manually reopening the app.
 *
 * Reuses the state BLEForegroundService persists: only restarts when the
 * service was running before shutdown. The service comes up in "reconnecting"
 * state; the React Native layer performs the actual reconnect once it inits.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BLEBootReceiver";
    private static final String PREFS_NAME = "BLEForegroundServicePrefs";
    private static final String PREF_WAS_RUNNING = "was_running";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        Log.d(TAG, "onReceive: " + action);

        if (action == null) {
            return;
        }
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(action)
            && !"com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean wasRunning = prefs.getBoolean(PREF_WAS_RUNNING, false);
        if (!wasRunning) {
            Log.d(TAG, "Service was not running before reboot, not restarting");
            return;
        }

        try {
            Intent serviceIntent = new Intent(context, BLEForegroundService.class);
            serviceIntent.setAction(BLEForegroundService.ACTION_START);
            serviceIntent.putExtra(BLEForegroundService.EXTRA_STATUS, "reconnecting");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            Log.d(TAG, "Foreground service restarted after boot");
        } catch (Exception e) {
            Log.e(TAG, "Failed to restart foreground service after boot", e);
        }
    }
}
`;

      fs.writeFileSync(path.join(javaDir, 'BootReceiver.java'), bootReceiverContent);
      console.log('✅ BootReceiver.java created successfully');

      // ==================== BackgroundTickReceiver.java ====================
      const backgroundTickContent = `package ${packageName};

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * Periodic wake-up that pierces Doze. JS timers are frozen in Doze, so we use
 * an AlarmManager alarm scheduled with setAndAllowWhileIdle (inexact — no
 * SCHEDULE_EXACT_ALARM permission needed). On each fire we emit a
 * "bleBackgroundTick" event to JS so the app can run a reconnect / health-check
 * tick, then reschedule the next alarm (inexact while-idle alarms don't repeat).
 */
public class BackgroundTickReceiver extends BroadcastReceiver {
    private static final String TAG = "BLEBackgroundTick";
    private static final String EVENT_NAME = "bleBackgroundTick";
    public static final String ACTION_TICK = "${packageName}.BACKGROUND_TICK";
    private static final int REQUEST_CODE = 9100;
    // Inexact cadence; the OS batches/relaxes this in Doze (~15 min floor).
    private static final long INTERVAL_MS = 15 * 60 * 1000L;
    // How long to hold a wake lock so JS has CPU to run the tick.
    private static final long WAKE_LOCK_MS = 30 * 1000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Background tick fired");
        PowerManager.WakeLock wakeLock = null;
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "safewave:BackgroundTick");
                wakeLock.acquire(WAKE_LOCK_MS);
            }
            emitTick(context);
        } catch (Exception e) {
            Log.e(TAG, "Error in background tick", e);
        } finally {
            // Always reschedule so the cadence continues, even if the emit failed.
            schedule(context);
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        }
    }

    private void emitTick(Context context) {
        try {
            ReactApplication reactApplication = (ReactApplication) context.getApplicationContext();
            ReactInstanceManager reactInstanceManager =
                reactApplication.getReactNativeHost().getReactInstanceManager();
            ReactContext reactContext = reactInstanceManager.getCurrentReactContext();
            if (reactContext != null) {
                WritableMap params = Arguments.createMap();
                params.putDouble("timestamp", System.currentTimeMillis());
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(EVENT_NAME, params);
                Log.d(TAG, "Background tick event sent to JS");
            } else {
                // RN context not up yet — the tick is best-effort, skip this round.
                Log.w(TAG, "React context not available, skipping tick emit");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error emitting background tick", e);
        }
    }

    private static PendingIntent buildPendingIntent(Context context) {
        Intent intent = new Intent(context, BackgroundTickReceiver.class);
        intent.setAction(ACTION_TICK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags);
    }

    /** Schedule (or reschedule) the next inexact, Doze-piercing wake-up. */
    public static void schedule(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) {
                return;
            }
            long triggerAt = System.currentTimeMillis() + INTERVAL_MS;
            PendingIntent pi = buildPendingIntent(context);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // Inexact but fires even in Doze; no SCHEDULE_EXACT_ALARM needed.
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }
            Log.d(TAG, "Next background tick scheduled in " + (INTERVAL_MS / 1000) + "s");
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule background tick", e);
        }
    }

    /** Cancel any pending wake-up (on manual disconnect / logout). */
    public static void cancel(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                am.cancel(buildPendingIntent(context));
                Log.d(TAG, "Background tick cancelled");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to cancel background tick", e);
        }
    }
}
`;

      fs.writeFileSync(path.join(javaDir, 'BackgroundTickReceiver.java'), backgroundTickContent);
      console.log('✅ BackgroundTickReceiver.java created successfully');

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
    'android.permission.RECEIVE_BOOT_COMPLETED',
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

  // ---- Add boot receiver ----
  if (!application.receiver) {
    application.receiver = [];
  }

  const receiverExists = application.receiver.some(
    (receiver) => receiver.$?.['android:name'] === '.BootReceiver'
  );

  if (!receiverExists) {
    application.receiver.push({
      $: {
        'android:name': '.BootReceiver',
        'android:enabled': 'true',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
          ],
        },
      ],
    });
    console.log('✅ BootReceiver added to AndroidManifest');
  }

  // ---- Add background-tick receiver (triggered by explicit PendingIntent) ----
  const tickReceiverExists = application.receiver.some(
    (receiver) => receiver.$?.['android:name'] === '.BackgroundTickReceiver'
  );

  if (!tickReceiverExists) {
    application.receiver.push({
      $: {
        'android:name': '.BackgroundTickReceiver',
        'android:enabled': 'true',
        'android:exported': 'false',
      },
    });
    console.log('✅ BackgroundTickReceiver added to AndroidManifest');
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
