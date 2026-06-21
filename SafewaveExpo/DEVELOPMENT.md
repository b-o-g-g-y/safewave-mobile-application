# Safewave Development Guide

## Quick Reference

### Daily Development (JavaScript/TypeScript changes only)

When you're making changes to `.ts`, `.tsx`, `.js` files (UI, logic, styling):

```bash
cd SafewaveExpo

# Business variant (default if APP_VARIANT is unset)
npm run start:business
# equivalent to: APP_VARIANT=business npx expo start

# Consumer variant
npm run start:consumer
# equivalent to: APP_VARIANT=consumer npx expo start

# Tunnel mode if you need it (works with either variant):
APP_VARIANT=consumer npx expo start --tunnel
```

Then scan the QR code with your phone. Changes will hot-reload automatically.

The variant is selected at start time via the `APP_VARIANT` environment variable. The two variants use different bundle IDs and Firebase configs, so the installed dev client you scan into must match the variant you're running. If you have both variants' dev clients installed on the same device, scan with the matching one.

---

### When to Rebuild the Native App

You need to rebuild when you:
- Add/remove/update packages that have **native code** (check if package has `ios/` or `android/` folders)
- Modify files in `ios/` or `android/` directories
- Change `app.config.js` native settings (like permissions, bundle ID, variant config, Firebase config paths, icons)
- Switch between business and consumer variants (the generated `ios/` and `android/` projects are variant-specific)

**Common packages that require rebuild:**
- `react-native-svg`
- `react-native-ble-plx`
- `@react-native-firebase/*`
- Any package with "native" in its name

---

### How to Rebuild

#### Option 1: Local Build (requires Mac + Xcode for iOS)

```bash
cd SafewaveExpo

# Clean old build artifacts (recommended after adding new native packages or switching variants)
rm -rf ios/build ios/Pods

# Rebuild iOS for the variant you're working on:

# Business
APP_VARIANT=business npx expo run:ios --device

# Consumer
APP_VARIANT=consumer npx expo run:ios --device
```

Without `APP_VARIANT` set, the build defaults to business.

Wait for Xcode to compile (~5-10 minutes first time, faster on subsequent builds).

#### Option 2: EAS Cloud Build (works from any machine)

```bash
cd SafewaveExpo

# Business variant dev client
eas build --profile development --platform ios

# Consumer variant dev client
eas build --profile development-consumer --platform ios
```

Each variant has its own `development`, `preview`, and `production` profiles in `eas.json`. The `-consumer` profiles set `APP_VARIANT=consumer` automatically.

After build completes (~15-20 min), install the new app on your device via the link provided.

---

### Production Releases

This file covers development workflows. For shipping to the App Store or Play Store (either variant), see [DEPLOYMENT.md](DEPLOYMENT.md). It covers per-variant build commands, signing requirements, version-bump rules and floors per store, and a pre-flight checklist for each release.

---

### Troubleshooting

#### App crashes on launch after adding a package

The native app doesn't have the new native code. Rebuild using instructions above.

#### Pod install fails with encoding error

Run this before pod install:
```bash
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
```

#### Build fails with missing header files

Clean everything and rebuild:
```bash
cd SafewaveExpo
rm -rf ios/build ios/Pods node_modules
npm install
cd ios && pod install && cd ..
npx expo run:ios --device
```

#### Metro bundler issues

Clear cache and restart:
```bash
npx expo start --tunnel --clear
```

#### Variant mismatch (wrong app icon, wrong bundle ID, Firebase init errors)

You probably scanned with the wrong variant's dev client, or rebuilt without `--clean` after switching variants. Fix:
```bash
cd SafewaveExpo
APP_VARIANT=<business|consumer> npx expo prebuild --clean
APP_VARIANT=<business|consumer> npx expo run:ios --device
```
And scan with the dev client whose bundle ID matches the variant you're running.

---

### Current Native Dependencies

These packages have native code and require a rebuild if added/updated:

| Package | Purpose |
|---------|---------|
| `react-native-ble-plx` | Bluetooth Low Energy |
| `react-native-svg` | SVG graphics (battery circle) |
| `@react-native-firebase/app` | Firebase core |
| `@react-native-firebase/auth` | Firebase authentication |
| `@react-native-firebase/firestore` | Firestore database |
| `@react-native-google-signin/google-signin` | Google Sign-In |
| `@invertase/react-native-apple-authentication` | Apple Sign-In |

---

## Background Behavior

### App Presence Tracking

The app continues to send heartbeats to Firebase every 60 seconds while in the background:

- **Purpose**: Enables real-time tracking of which employees have the app running
- **Frequency**: Every 60 seconds (same as foreground)
- **Platform**: Works on both iOS and Android
- **Detection**: Admins can query for stale heartbeat timestamps to identify closed/killed apps

### Bluetooth Connectivity

The app maintains Bluetooth connection to the Safewave Band while in the background:

- **iOS**: Configured with `bluetooth-central` background mode in `app.config.js`
- **Android**: Requires `ACCESS_BACKGROUND_LOCATION` permission for background BLE operations
- **Battery Impact**: Maintaining Bluetooth and Firebase writes in background will consume additional battery
- **Band Heartbeats**: The app sends band status updates to Firestore every 60 seconds while connected

### Permissions Required

#### iOS
- Bluetooth permissions (already configured in `app.config.js`)
- Background Bluetooth mode (already configured in `app.config.js`; consumer variant also has `fetch` and `remote-notification` background modes for parity with the previously-shipped Flutter app)

#### Android
- Standard Bluetooth permissions (already configured)
- `ACCESS_BACKGROUND_LOCATION` - Required for Bluetooth operations in background on Android 12+
- `FOREGROUND_SERVICE` - For maintaining background services

### Behavior on App State Changes

| Event | Behavior |
|-------|----------|
| **App goes to background** | Heartbeats continue, Bluetooth stays connected |
| **App returns to foreground** | Services continue running (no interruption) |
| **App is killed/terminated** | Heartbeats stop, Bluetooth disconnects, last timestamp remains in Firebase |
| **Bluetooth connection lost** | Auto-reconnect attempts when app is in foreground |

### Implementation Details

**Services that continue in background:**
1. `AppPresenceService` - Firebase heartbeats every 60s
2. `BluetoothStore.startBandHeartbeat()` - Band status updates every 60s
3. BLE connection monitoring and battery updates

**Services that stop in background:**
- Auto-reconnect scanning (only runs in foreground to conserve battery)

---
bogdan.shoyat+amazon2@gmail.com
AMAZONGEORGIA