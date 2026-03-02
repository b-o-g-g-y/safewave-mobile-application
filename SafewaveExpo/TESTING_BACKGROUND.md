# Testing Background Services

## Quick Test Guide

### Test 1: Background Heartbeats

**Goal:** Verify that Firebase heartbeats continue while app is in background

**Steps:**
1. Open the app and log in
2. Open Firebase Console → Firestore → `users` collection → your user document
3. Note the `lastHeartbeat` timestamp
4. Send the app to background (press home button)
5. Wait 90 seconds
6. Refresh the Firestore document
7. Verify `lastHeartbeat` has updated (should be ~60-90 seconds newer)

**Expected Result:** ✅ Heartbeat timestamp continues to update every 60 seconds

**Failure Indicators:**
- ❌ Timestamp stops updating after backgrounding
- ❌ `isAppOpen` changes to `false`

---

### Test 2: Bluetooth Connection in Background

**Goal:** Verify that Bluetooth connection remains active in background

**Steps:**
1. Connect to a Safewave Band
2. Verify battery level is showing
3. Send app to background (press home button)
4. Wait 2-3 minutes
5. Return to app
6. Check connection status

**Expected Result:** 
- ✅ Band shows as "Connected"
- ✅ Battery level is current
- ✅ No reconnection animation/delay

**Failure Indicators:**
- ❌ Shows "Disconnected"
- ❌ Auto-reconnect starts
- ❌ Battery level is stale

---

### Test 3: Band Heartbeats in Background

**Goal:** Verify band status updates continue in background

**Steps:**
1. Connect to a Safewave Band
2. Open Firebase Console → Firestore → `organizations/[your-org]/bands/[band-name]`
3. Note the `lastBandHeartbeat` timestamp
4. Send app to background
5. Wait 90 seconds
6. Refresh the Firestore document
7. Verify `lastBandHeartbeat` has updated

**Expected Result:** ✅ Band heartbeat timestamp updates every 60 seconds

**Failure Indicators:**
- ❌ Timestamp stops updating
- ❌ `isConnected` changes to `false`

---

### Test 4: App Termination Detection

**Goal:** Verify that killing the app properly stops heartbeats

**Steps:**
1. Open app and verify heartbeats are working
2. Force-close the app:
   - **iOS:** Swipe up from bottom, swipe app away
   - **Android:** Recent apps → swipe away
3. Wait 2-3 minutes
4. Check Firestore `lastHeartbeat` timestamp

**Expected Result:** 
- ✅ Heartbeat timestamp stops updating
- ✅ Last timestamp shows when app was killed
- ✅ `isAppOpen` remains `true` (stale state indicates app was killed)

**Failure Indicators:**
- ❌ Heartbeats continue after kill (impossible, but check anyway)

---

### Test 5: Return to Foreground

**Goal:** Verify smooth transition from background to foreground

**Steps:**
1. App running in background with band connected
2. Wait 5 minutes
3. Return to app
4. Observe behavior

**Expected Result:**
- ✅ Band still connected
- ✅ Battery level updates immediately
- ✅ No loading states or reconnections
- ✅ Heartbeats continue seamlessly

**Failure Indicators:**
- ❌ Disconnection/reconnection cycle
- ❌ Delays or loading screens

---

### Test 6: Lock Screen Behavior

**Goal:** Verify behavior when device is locked

**Steps:**
1. Connect to band
2. Lock the device (power button)
3. Wait 5 minutes
4. Unlock device
5. Check Firebase timestamps
6. Open app

**Expected Result:**
- ✅ Heartbeats continued during lock
- ✅ Band still connected
- ✅ Seamless return to app

**Failure Indicators:**
- ❌ Heartbeats stopped
- ❌ Band disconnected

---

## Monitoring Tools

### Firebase Console Queries

**Check User Presence:**
```javascript
// In Firebase Console → Firestore
// Navigate to: users → [userId]

// Key fields:
{
  isAppOpen: true,
  lastHeartbeat: 1738012345678,
  lastHeartbeatReadable: "2026-01-26T15:45:45.678Z"
}

// App is active if:
// (Date.now() - lastHeartbeat) < 120000  // 2 minutes
```

**Check Band Status:**
```javascript
// Navigate to: organizations → [orgId] → bands → [bandName]

{
  isConnected: true,
  lastBandHeartbeat: 1738012345678,
  batteryLevel: 85,
  lastConnectedReadable: "2026-01-26T15:45:45.678Z"
}
```

### Device Logs

**iOS:**
```bash
# Watch real-time logs
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "Safewave"'

# Or use Console.app
# Filter: process:Safewave
```

**Android:**
```bash
# Watch React Native logs
adb logcat *:S ReactNative:V ReactNativeJS:V

# Filter for heartbeats
adb logcat | grep -i heartbeat
```

### Key Log Messages to Look For

**Heartbeat logs:**
```
[AppPresenceService] Heartbeat sent
[AppPresenceService] App went to background, continuing heartbeats
```

**Band heartbeat logs:**
```
[BLE Store] Heartbeat sent
```

**State change logs:**
```
[AppPresenceService] App state changed: active -> background
[AppPresenceService] App state changed: background -> active
```

---

## Troubleshooting

### Problem: Heartbeats Stop in Background

**Diagnosis:**
1. Check device logs for app termination
2. Check iOS Settings → Battery → Battery Health
3. Check Android Settings → Apps → Safewave → Battery → Unrestricted

**Solutions:**
- Ensure app isn't being killed by OS
- Disable battery optimization for Safewave
- Check for JavaScript errors in logs

---

### Problem: Bluetooth Disconnects in Background

**iOS:**
- Verify `bluetooth-central` is in `app.json` → `ios.infoPlist.UIBackgroundModes`
- Check that band is in range
- iOS may disconnect after no data transfer for ~10 minutes (expected)

**Android:**
- Check permission: Settings → Apps → Safewave → Permissions → Location → Allow all the time
- Disable battery optimization
- Some manufacturers (Samsung, Xiaomi) aggressively kill background services

---

### Problem: High Battery Drain

**Expected:**
- Background Bluetooth: ~3-5% per hour
- Background Firebase writes: ~1-2% per hour
- Combined: ~5-7% per hour

**If higher than expected:**
- Check for excessive logging (remove console.logs in production)
- Verify only one heartbeat interval is running
- Check Firebase write frequency

---

## Performance Expectations

### Battery Impact
- **Minimal:** ~5-7% battery per hour in background
- **iOS:** Slightly better due to better background optimization
- **Android:** May vary by manufacturer

### Network Usage
- **Heartbeat size:** ~100 bytes per heartbeat
- **Frequency:** Every 60 seconds
- **Hourly:** ~6 KB/hour (negligible)

### Memory Usage
- **Foreground:** ~50-80 MB
- **Background:** ~30-50 MB
- **iOS:** Better memory management
- **Android:** May be killed if memory is low

---

## Success Criteria

✅ **All tests pass:**
1. Heartbeats continue in background
2. Bluetooth stays connected in background
3. Band heartbeats continue in background
4. Killing app stops heartbeats
5. Returning to foreground is seamless
6. Lock screen doesn't interrupt services

✅ **Performance acceptable:**
- Battery drain < 10% per hour
- No app crashes or freezes
- Firebase timestamps update consistently

✅ **User experience smooth:**
- No visible disconnections
- No reconnection delays
- Band remains functional

---

## Notes for Production

### Before Release:

1. **Remove excessive logging:**
   - Production builds should minimize console.log calls
   - Keep only critical error logs

2. **Test on multiple devices:**
   - Different iOS versions (14, 15, 16, 17)
   - Different Android manufacturers (Samsung, Google, OnePlus)
   - Different Android versions (11, 12, 13, 14)

3. **Monitor Firebase costs:**
   - Each user: 1 write/minute = 43,200 writes/month
   - 100 users = 4.32M writes/month
   - Stay within free tier: 20K writes/day = 600K/month

4. **User education:**
   - Inform users about battery impact
   - Provide option to disable background services
   - Guide on disabling battery optimization

5. **Analytics:**
   - Track heartbeat reliability
   - Monitor connection drops
   - Measure battery impact across devices
