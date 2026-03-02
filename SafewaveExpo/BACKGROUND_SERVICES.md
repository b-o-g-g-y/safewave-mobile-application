# Background Services Implementation

## Overview

The Safewave app now maintains background connectivity and continues sending heartbeats to Firebase while in the background. This enables real-time tracking of app presence and Bluetooth band connectivity.

## Changes Made

### 1. AppPresenceService (`src/services/AppPresenceService.ts`)

**Previous Behavior:**
- Stopped heartbeats when app went to background
- Marked app as "closed" when backgrounded

**New Behavior:**
- Continues sending heartbeats every 60 seconds in background
- Only marks app as closed when actually terminated or user logs out
- Maintains app state as "open" while running in background

**Key Changes:**
```typescript
// App state handler no longer stops heartbeats or marks as closed
_handleAppStateChange: (nextAppState: AppStateStatus): void => {
  // Background: Continue heartbeats, don't mark as closed
  // Foreground: Continue heartbeats (no restart needed)
}
```

### 2. App.tsx

**Previous Behavior:**
- Logged `app_closed` event when app went to background
- Called `handleAppClosed()` on Bluetooth store
- Stopped band heartbeats

**New Behavior:**
- No special actions when app goes to background
- Services continue running seamlessly
- Only cleanup on logout or unmount

**Removed:**
- `ActivityLogService.logAppClosed()` call
- `useBluetoothStore.getState().handleAppClosed()` call

### 3. BluetoothStore (`src/store/bluetoothStore.ts`)

**Changes:**
- Removed `handleAppClosed()` method
- Band heartbeats continue in background
- Auto-reconnect only attempts when app is in foreground (to conserve battery during background)

### 4. app.json Configuration

**Added Android Permissions:**
```json
"permissions": [
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.FOREGROUND_SERVICE"
]
```

**iOS Configuration (already present):**
```json
"UIBackgroundModes": ["bluetooth-central"]
```

## Background Services

### Services that Continue in Background:

1. **Firebase Heartbeats** (AppPresenceService)
   - Frequency: Every 60 seconds
   - Purpose: Real-time app presence tracking
   - Updates: `lastHeartbeat` timestamp in Firestore

2. **Band Heartbeats** (BluetoothStore)
   - Frequency: Every 60 seconds
   - Purpose: Track band connection status and battery
   - Updates: Band status in Firestore

3. **Bluetooth Connection**
   - Maintains active BLE connection to Safewave Band
   - Receives battery updates and notifications
   - iOS: Uses `bluetooth-central` background mode
   - Android: Uses background location permission

### Services that Pause in Background:

1. **Auto-reconnect Scanning**
   - Only runs when app is in foreground
   - Reason: Conserves battery and prevents excessive scanning

## Platform-Specific Behavior

### iOS
- Background Bluetooth works via `bluetooth-central` mode
- Firebase heartbeats continue via JavaScript timers
- Connection maintained as long as app is in memory
- OS may terminate app after extended background time

### Android
- Requires `ACCESS_BACKGROUND_LOCATION` for background BLE
- Firebase heartbeats continue via JavaScript timers
- More aggressive background restrictions on Android 12+
- May need foreground service for guaranteed background execution

## User Experience

### What Users Will Notice:

✅ **App stays connected to band while in background**
- No need to keep app open in foreground
- Band continues to work while phone is locked

✅ **Real-time tracking for admins**
- Admins can see which employees have app running
- Heartbeats show "last seen" timestamps

✅ **Seamless app switching**
- No reconnection needed when returning to app
- No interruption to band functionality

⚠️ **Battery Consideration**
- Background Bluetooth + Firebase writes consume additional battery
- Trade-off for real-time tracking functionality

### What Terminates Services:

- User force-closes/kills the app
- User logs out
- OS terminates app due to memory pressure
- User explicitly disconnects from band

## Testing

### How to Test Background Behavior:

1. **Connect to a Safewave Band**
   ```
   - Open app
   - Connect to band
   - Verify heartbeats in Firestore
   ```

2. **Send App to Background**
   ```
   - Press home button
   - Wait 2-3 minutes
   - Check Firestore for continued heartbeat updates
   ```

3. **Return to Foreground**
   ```
   - Reopen app
   - Verify band is still connected
   - Check battery level updates
   ```

4. **Force Kill App**
   ```
   - Swipe up to kill app
   - Check Firestore - heartbeats should stop
   - Reopen app - auto-reconnect should attempt
   ```

### Monitoring Heartbeats in Firebase:

```javascript
// Query user presence
db.collection('users').doc(userId).get()
  .then(doc => {
    const lastHeartbeat = doc.data().lastHeartbeat;
    const now = Date.now();
    const isActive = (now - lastHeartbeat) < 120000; // 2 minutes threshold
  });

// Query band status
db.collection('organizations').doc(orgId)
  .collection('bands').doc(bandName).get()
  .then(doc => {
    const lastHeartbeat = doc.data().lastBandHeartbeat;
    const isConnected = doc.data().isConnected;
  });
```

## Troubleshooting

### Heartbeats Stop in Background

**Possible Causes:**
1. OS killed the app due to memory pressure
2. User force-closed the app
3. App crashed

**Solution:**
- Check device logs for app termination
- Verify Firebase connection is stable
- Check for JavaScript errors

### Bluetooth Disconnects in Background

**iOS:**
- Check that `bluetooth-central` is in `UIBackgroundModes`
- Verify band is actually in range
- iOS may disconnect after ~10 minutes if no data transfer

**Android:**
- Verify background location permission is granted
- Check battery optimization settings
- Some manufacturers aggressively kill background apps

### High Battery Consumption

**Expected:**
- Background Bluetooth + Firebase writes use more battery
- This is a trade-off for real-time tracking

**Mitigation:**
- Reduce heartbeat frequency if needed (currently 60s)
- Consider using foreground service with notification
- Implement battery optimization opt-out for critical users

## Future Improvements

### Potential Enhancements:

1. **Foreground Service (Android)**
   - Show persistent notification
   - Guarantee background execution
   - Better reliability on aggressive devices

2. **Adaptive Heartbeat Frequency**
   - Reduce frequency in background (e.g., 2-5 minutes)
   - Resume full frequency in foreground
   - Balance battery vs. real-time accuracy

3. **Background Fetch Tasks**
   - Use native background fetch APIs
   - More reliable than JavaScript timers
   - Better battery optimization

4. **Battery Optimization**
   - Monitor battery level
   - Reduce background activity on low battery
   - User setting for background behavior

## References

- [React Native Background Tasks](https://docs.expo.dev/versions/latest/sdk/task-manager/)
- [iOS Background Execution](https://developer.apple.com/documentation/corebluetooth/transferring_data_between_bluetooth_low_energy_devices)
- [Android Background Location](https://developer.android.com/training/location/permissions)
- [BLE Background Modes](https://punchthrough.com/core-bluetooth-basics/)
