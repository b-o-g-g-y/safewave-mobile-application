# Troubleshooting: NotificationListenerService Not Intercepting

## Issue
The NotificationListenerService is not intercepting notifications on Android.

## Required Steps to Make It Work

### 1. Run Prebuild
The Expo config plugin needs to generate the native Android code:

```bash
cd SafewaveExpo
npx expo prebuild --platform android --clean
```

This will:
- Create `NotificationListener.java` in `android/app/src/main/java/com/safewave/forbusiness/`
- Add the service to `AndroidManifest.xml`
- Set up all required permissions

### 2. Rebuild the App
After prebuild, rebuild the Android app:

```bash
npx expo run:android --device
```

Or if using EAS:
```bash
eas build --platform android --profile development
```

### 3. Grant Notification Access Permission
This is **CRITICAL** - the service won't work without this permission:

1. Open Android Settings
2. Go to: **Apps** > **Safewave** > **Special app access**
3. Select **Notification access**
4. Toggle **ON** for Safewave

Alternative path:
- Settings > Notifications > Notification access > Enable Safewave

### 4. Verify the Service is Running

Check if the service is connected:

```bash
# View Android logs
npx react-native log-android

# Or use adb directly
adb logcat | grep NotificationListener
```

You should see:
```
NotificationListener: NotificationListener connected
```

### 5. Test Notifications

Send a test notification:
```bash
# From your computer to the connected device
adb shell cmd notification post -t "Test Title" tag "Test notification body"
```

Or trigger a real notification from an app you've added to your alerts.

## Expected Logs

### When Service Connects:
```
[NotificationListener] NotificationListener connected
```

### When Notification Arrives:
```
[NotificationListener] Notification received from: com.whatsapp
[NotificationListener] Event sent to React Native: com.whatsapp
[NotificationListener] Processing notification for: WhatsApp
[NotificationListener] Sending vibration: {strength: 50, numBuzzes: 2, ...}
```

### In React Native:
```
[NotificationListener] Apps cache updated: 2 Android apps cached
[NotificationListener] Cached bundle IDs: ["com.whatsapp", "com.telegram"]
```

## Common Issues

### 1. Service Not in Manifest
**Symptom**: No "NotificationListener connected" log
**Fix**: Run `npx expo prebuild --platform android --clean`

### 2. Notification Access Not Granted
**Symptom**: Service connected but no notifications intercepted
**Fix**: Grant permission in Settings (see step 3 above)

### 3. React Context Not Available
**Symptom**: Log says "React context not available"
**Fix**: Make sure the app is running in foreground when notification arrives, or check if React Native bridge is initialized

### 4. Plugin Not Applied
**Symptom**: Build succeeds but no Java file generated
**Fix**: Verify `app.json` has `"./plugins/withNotificationListener"` in plugins array

### 5. Wrong Package Name
**Symptom**: Service created but in wrong directory
**Fix**: Verify package name in `app.json` matches `com.safewave.forbusiness`

## Verification Checklist

Run these checks after prebuild:

```bash
# 1. Check if Java file exists
ls -la SafewaveExpo/android/app/src/main/java/com/safewave/forbusiness/NotificationListener.java

# 2. Check if service is in manifest
grep -A 10 "NotificationListener" SafewaveExpo/android/app/src/main/AndroidManifest.xml

# 3. Check if permission is in manifest
grep "BIND_NOTIFICATION_LISTENER_SERVICE" SafewaveExpo/android/app/src/main/AndroidManifest.xml

# 4. Verify plugin is registered
grep "withNotificationListener" SafewaveExpo/app.json
```

All should return results.

## Testing Without Real Notifications

You can test the service connection by checking the logs:

```bash
# Clear logs
adb logcat -c

# Start logging
adb logcat | grep -E "(NotificationListener|Safewave)"

# You should see the "connected" message when the app starts
```

## Manual Testing Steps

1. **Setup**: Add an app (like Gmail) to your Alerts
2. **Check Permission**: Verify notification access is granted
3. **Trigger**: Send yourself an email to get a Gmail notification
4. **Verify**: Check if band vibrates and history is logged

## Debug Mode

Add more logging to see what's happening:

1. Check logcat for all Safewave logs:
```bash
adb logcat | grep -i safewave
```

2. Check specifically for notification events:
```bash
adb logcat | grep "onNotificationPosted\|NotificationListener"
```

3. Verify React Native is receiving events:
```bash
adb logcat | grep "onNotificationPosted"
```

## Still Not Working?

If after all these steps it's still not working:

1. **Clean and Rebuild**:
```bash
cd SafewaveExpo/android
./gradlew clean
cd ..
npx expo prebuild --platform android --clean
npx expo run:android --device
```

2. **Check Notification Settings**:
   - Make sure "Do Not Disturb" is OFF
   - Check that the monitored app can show notifications
   - Verify the app is actually configured in your Alerts screen

3. **Verify Bundle ID**:
   - The bundle ID in Firebase must match the actual package name
   - Example: Gmail is `com.google.android.gm`, not `com.gmail`

4. **Test with Simple App**:
   - Try with a system app like Clock or Messages first
   - These are more reliable for testing

## Next Steps

Once you complete the prebuild step, you should start seeing logs from the NotificationListenerService!
