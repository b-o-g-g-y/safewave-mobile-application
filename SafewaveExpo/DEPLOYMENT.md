# Deployment Guide

This project ships **two variants from a single codebase**:

| Variant   | iOS bundle              | Android package         | Store name                  |
|-----------|-------------------------|-------------------------|-----------------------------|
| business  | `com.safewave.forbusiness` | `com.safewave.forbusiness` | Safewave for Business    |
| consumer  | `com.safewaveMobileApp` | `com.safewaveMobileApp` | Safewave                    |

The variant is selected at build time via the `APP_VARIANT` environment variable. The same codebase, the same dependencies, the same React components, produce both apps. Only the values in `variants.business` and `variants.consumer` inside [`app.config.js`](app.config.js) differ between them.

There are four deployment paths covered here:
1. iOS business
2. iOS consumer
3. Android business
4. Android consumer

iOS deployment is largely the same across variants; only the bundle ID, version, and Firebase config file change. Android is similar except each variant uses its own signing keystore.

---

## Prerequisites (one-time setup)

You need all of these in place before any deployment will succeed.

### Accounts
- Apple Developer membership (team ID `VXLM9VZK85`)
- Google Play Console developer account
- Firebase project access for `safewave-371716`
- EAS account (optional if you build everything locally, recommended for cloud builds and credential management)

### Local tools
- Xcode (latest stable)
- Android Studio (provides Android SDK, JDK, and Gradle)
- Node.js and npm (already in use for this project)
- EAS CLI installed globally if using EAS: `npm i -g eas-cli`

### Keystores
Both Android keystores live at `~/safewave-keystores/`. Passwords are in the password manager.

| Variant   | Keystore file                                            | Alias                       |
|-----------|----------------------------------------------------------|-----------------------------|
| business  | `~/safewave-keystores/safewave-release.keystore`         | `safewave-release`          |
| consumer  | `~/safewave-keystores/safewave-consumer-release.keystore` | `safewave-consumer-upload` |

Cert fingerprints, in case of cross-checking, live in [`.claude/projects/.../memory/safewave_android_keystores.md`](../.claude/projects/-Users-bogdan-Desktop-Safewave-mobile-app-react/memory/safewave_android_keystores.md).

### Firebase config files
| Variant   | iOS plist                                              | Android JSON                                          |
|-----------|--------------------------------------------------------|-------------------------------------------------------|
| business  | [`firebase/GoogleService-Info.plist`](firebase/GoogleService-Info.plist) | [`firebase/google-services.json`](firebase/google-services.json) |
| consumer  | [`firebase/GoogleService-Info.consumer.plist`](firebase/GoogleService-Info.consumer.plist) | [`firebase/google-services.consumer.json`](firebase/google-services.consumer.json) |

If any of these are missing or stale, redownload from the Firebase Console under project `safewave-371716`.

### Apple developer portal capabilities
Each iOS App ID must have these capabilities enabled in the Apple Developer portal:
- Sign in with Apple
- Push Notifications
- Background Modes: Uses Bluetooth LE accessories. Consumer also has Background fetch and Remote notifications.

These should already be in place since both apps are live. If Xcode complains about a missing provisioning profile during signing, that's the place to check first.

---

## Versioning rules

Apple and Google have different uniqueness rules for version numbers. Both must be respected per upload or the store will reject the build.

### iOS
- `CFBundleShortVersionString` (the marketing version, e.g. `1.2.0`): must be greater than or equal to what's currently approved on App Store Connect. Cannot reuse a closed train (e.g. if 1.1.x is closed, you cannot ship 1.1.5 or 1.1.6).
- `CFBundleVersion` (the build number): must be unique and incrementing *within* a given `CFBundleShortVersionString`. Resets across marketing version changes (so 1.2.0 build 1 is valid even if 1.1.3 had build 50).

### Android
- `versionName` (e.g. `1.2.0`): can be anything, even reused. Play Store doesn't enforce uniqueness or monotonicity here.
- `versionCode` (integer): must be strictly greater than every prior live versionCode for the same package. Cannot reset, cannot reuse.

### Where versions live
In [`app.config.js`](app.config.js), per variant:

```js
business: {
  version: '1.0.1',          // CFBundleShortVersionString and versionName
  iosBuildNumber: '5',       // CFBundleVersion
  androidVersionCode: 5,     // Android versionCode
  ...
},
consumer: {
  version: '1.2.0',
  iosBuildNumber: '1',
  androidVersionCode: 16,
  ...
},
```

### Before each release, bump the right values
1. Decide which variant and platform you're shipping
2. Look up the current live values in the store console for that variant
3. Bump in `app.config.js`:
   - For iOS: bump `iosBuildNumber` (and optionally `version` if it's a new marketing release)
   - For Android: bump `androidVersionCode` (and optionally `version`)
4. Commit the bump as part of the release

There is no auto-increment with `appVersionSource: local` in [`eas.json`](eas.json), which is the current setting. You bump manually before every build.

---

## iOS deployment

The same procedure works for business and consumer; the values differ.

### 1. Bump the version
Edit [`app.config.js`](app.config.js). For the variant you're shipping, increment `iosBuildNumber` (and optionally `version`). Commit.

### 2. Run the prebuild for the right variant

For business:
```
APP_VARIANT=business npx expo prebuild --clean -p ios
```

For consumer:
```
APP_VARIANT=consumer npx expo prebuild --clean -p ios
```

The `--clean` flag wipes the `ios/` folder and regenerates it. This is important when switching variants because stale bundle IDs persist otherwise.

### 3. Verify the generated Xcode project picks up the right values
```
grep -A1 PRODUCT_BUNDLE_IDENTIFIER ios/*.xcodeproj/project.pbxproj | grep -E 'com\.' | sort -u
plutil -p ios/*/Info.plist | grep -E 'CFBundleDisplayName|CFBundleShortVersionString|CFBundleVersion'
```

Bundle ID must match the variant. Display name and versions must match what you set.

### 4. Build the archive

**Via Xcode (simpler if you have it open):**
```
open ios/*.xcworkspace
```
- Pick a "Generic iOS Device" or your connected device as the target
- Product menu, then Archive
- When archive completes, Xcode opens the Organizer
- Click "Distribute App", then "App Store Connect", then "Upload"
- Xcode signs with the right team automatically as long as Signing & Capabilities → Automatically manage signing is checked and the team is `Safewave Inc.` (`VXLM9VZK85`)

**Via EAS (no Xcode interaction needed):**

For business:
```
npm run build:business:ios
```

For consumer:
```
npm run build:consumer:ios
```

EAS handles signing automatically against the Apple team. Returns a URL when the build is ready. Download the IPA from there.

### 5. Submit to App Store Connect

If you uploaded via Xcode Organizer, the build will appear in App Store Connect → Apps → (variant) → TestFlight within a few minutes.

If you built via EAS:
```
npm run submit:business     # or :consumer
```
This wraps `eas submit --profile production` (or `production-consumer`).

### 6. Wait for processing
TestFlight shows "Processing" for 5 to 30 minutes after upload. Once processed, it appears in the available builds list for that variant.

### 7. Submit for review
In App Store Connect:
- For internal testers only: just enable internal testing on the new build
- For the public: create a new version, attach the build, fill in What's New, submit for review

### 8. Common iOS upload errors
- **"CFBundleShortVersionString must be higher than previously approved version"**: bump `version` in `app.config.js` above what's listed in App Store Connect. Closed trains cannot be reused.
- **"This bundle is invalid"**: usually a missing entitlement (Apple Sign In, Push, Background Modes) on the App ID in the Apple Developer portal. Add the capability there, then re-archive.
- **"Upload Symbols Failed" for hermes.framework**: warning, not a blocker. The binary uploads fine. Crashes inside the Hermes JS engine itself won't be symbolicated in App Store Connect crash reports until the Hermes dSYM is also uploaded.

---

## Android deployment

iOS signing is handled invisibly by Apple. Android signing is on you, and the keystore is variant-specific. Get this wrong and Play Store rejects with `INVALID_APK_SIGNATURE`.

### 1. Bump the version
Edit [`app.config.js`](app.config.js). For the variant you're shipping, increment `androidVersionCode` (and optionally `version`). Commit.

### 2. Run the prebuild for the right variant

For business:
```
APP_VARIANT=business npx expo prebuild --clean -p android
```

For consumer:
```
APP_VARIANT=consumer npx expo prebuild --clean -p android
```

### 3. Verify the generated project
```
grep -E 'applicationId|versionCode' android/app/build.gradle
```
applicationId and versionCode should match the variant.

### 4. Build the AAB locally

Local Android builds depend on gradle properties for signing. **There is a foot-gun here:** `~/.gradle/gradle.properties` has the business keystore wired in as the default. If you run `./gradlew bundleRelease` without overrides, the build silently picks up the business keystore even when you're trying to ship consumer.

Always pass `-P` flags explicitly. `-P` flags on the command line override `~/.gradle/gradle.properties`.

**Business AAB:**
```
cd android
./gradlew bundleRelease \
  -PSAFEWAVE_UPLOAD_STORE_FILE=$HOME/safewave-keystores/safewave-release.keystore \
  -PSAFEWAVE_UPLOAD_KEY_ALIAS=safewave-release \
  -PSAFEWAVE_UPLOAD_STORE_PASSWORD='<business keystore password>' \
  -PSAFEWAVE_UPLOAD_KEY_PASSWORD='<business key password>'
cd ..
```

**Consumer AAB:**
```
cd android
./gradlew bundleRelease \
  -PSAFEWAVE_UPLOAD_STORE_FILE=$HOME/safewave-keystores/safewave-consumer-release.keystore \
  -PSAFEWAVE_UPLOAD_KEY_ALIAS=safewave-consumer-upload \
  -PSAFEWAVE_UPLOAD_STORE_PASSWORD='<consumer keystore password>' \
  -PSAFEWAVE_UPLOAD_KEY_PASSWORD='<consumer key password>'
cd ..
```

Output lands at `android/app/build/outputs/bundle/release/app-release.aab` (about 50 MB).

**Or via EAS:**
```
npm run build:business:android     # or build:consumer:android
```
EAS picks the right keystore based on the bundle ID, using whatever has been uploaded via `eas credentials`. The cloud builds are slower but reproducible and don't depend on local gradle state.

### 5. Verify the AAB is signed with the correct keystore
```
keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab | grep -E 'SHA1|SHA256'
```

Compare against the expected fingerprint:

| Variant   | SHA-256                                                                                              |
|-----------|------------------------------------------------------------------------------------------------------|
| business  | `55:81:FF:9E:21:7F:2F:82:36:9E:28:1F:89:35:18:75:50:91:BF:29:04:72:B6:3D:33:BB:A8:8C:EC:03:ED:4B`     |
| consumer  | `D2:77:B6:B1:B2:11:6B:5F:8A:A6:2F:97:0D:32:73:96:2D:22:36:98:A5:DF:B7:42:00:4C:7A:68:FB:E3:F0:0B`     |

If the SHA-256 doesn't match, **do not upload**. The build picked up the wrong keystore (almost certainly because the `-P` flags weren't applied correctly). Delete the AAB and rebuild with explicit `-P` overrides.

### 6. Upload to Play Console

Play Console, the variant's app, then **Test and release** → **Production** (or an Internal/Open testing track for a softer rollout). Click **Create new release**, drop the AAB into the upload area.

If Play Console accepts the AAB, fill in release notes, save, then review and roll out.

### 7. Common Android upload errors

- **`INVALID_APK_SIGNATURE`**: the AAB was signed with a keystore whose cert doesn't match what Google has on file as your upload key. Almost always the wrong variant's keystore (see step 5). For consumer specifically, this can also mean Google's upload-key reset hasn't been approved yet.
- **"Version code X has already been used"**: bump `androidVersionCode` in `app.config.js`, rebuild.
- **"Cannot release to a track that contains a higher version code"**: there's a build on a higher track (e.g. internal testing) with a higher versionCode than what you're uploading to production. Bump above that, rebuild.

---

## Consumer Android: the upload-key reset workflow

The original consumer Flutter app's upload keystore was lost. Until Google approves the reset, no consumer Android AAB can be uploaded to the Play Store, regardless of how it's built locally.

### Status check
Run this to confirm whether the reset has been approved:
```
keytool -printcert -jarfile <recent consumer AAB> | grep SHA256
```
Then compare against the cert on Play Console → Safewave consumer app → App integrity → App signing → Upload key certificate. If they match, the reset has gone through.

### If the reset is still pending
Submit the reset request via:
- Play Console → consumer app → Test and release → Setup → App integrity → App signing → "Request upload key reset" (if you can find it in the UI)
- Or the support form: https://support.google.com/googleplay/android-developer/contact/key

The PEM to attach: `~/safewave-keystores/safewave-consumer-upload_certificate.pem`

Approval typically takes 1 to 2 business days. You can build the consumer AAB ahead of time, hold onto it, and upload immediately when the approval lands.

### After the reset is approved
1. Upload the new keystore to EAS (if you use EAS):
   ```
   APP_VARIANT=consumer eas credentials
   ```
   Android, then Production, "Set up a new keystore", "Use existing", point at `~/safewave-keystores/safewave-consumer-release.keystore`.
2. Add the **Play App Signing key certificate** (not the upload key) SHA-1 and SHA-256 to the consumer Android app in Firebase. Get them from Play Console → App integrity → App signing → "App signing key certificate". Add as fingerprints in Firebase Console. Re-download `google-services.json` after adding.

This is what makes Google Sign-In work on production Android builds. Without it, users who install from the Play Store cannot sign in, even though sideloaded builds work fine.

---

## Quick reference: per-variant build commands

| Goal                            | Command                                                                                            |
|---------------------------------|----------------------------------------------------------------------------------------------------|
| Start dev server, business      | `npm run start:business`                                                                            |
| Start dev server, consumer      | `npm run start:consumer`                                                                            |
| Prebuild iOS, business          | `APP_VARIANT=business npx expo prebuild --clean -p ios`                                            |
| Prebuild iOS, consumer          | `APP_VARIANT=consumer npx expo prebuild --clean -p ios`                                            |
| Prebuild Android, business      | `APP_VARIANT=business npx expo prebuild --clean -p android`                                        |
| Prebuild Android, consumer      | `APP_VARIANT=consumer npx expo prebuild --clean -p android`                                        |
| EAS production build, iOS       | `npm run build:business:ios` or `npm run build:consumer:ios`                                       |
| EAS production build, Android   | `npm run build:business:android` or `npm run build:consumer:android`                               |
| EAS submit to store, iOS        | `npm run submit:business` or `npm run submit:consumer`                                             |

---

## Switching variants in local dev

Whenever you switch the variant you're working with locally:
1. Run the prebuild with `--clean` for the new variant. Without `--clean`, the old variant's bundle ID and Firebase config can leak into the new build.
2. If you have an existing dev build installed on a device, it stays installed and continues to use the old variant. Install the new variant separately. Both can coexist on the same device because the bundle IDs differ.

---

## Pre-flight checklist before any release

Use this every time, regardless of variant or platform:

- [ ] On `main` (or the branch you ship from), pulled latest
- [ ] Looked up the current live version on the store console for this variant + platform
- [ ] Bumped `version` and the relevant build number in `app.config.js`
- [ ] Committed the version bump
- [ ] Ran `npx expo prebuild --clean -p <ios|android>` with the right `APP_VARIANT`
- [ ] Verified bundle ID and versions in the generated native files
- [ ] For Android: verified SHA-256 of the built AAB matches the expected fingerprint
- [ ] Wrote the What's New / release notes text
- [ ] Uploaded
- [ ] Tested on TestFlight / Internal Testing before promoting to production
