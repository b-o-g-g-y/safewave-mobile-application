# Safewave for Business

## Run on your phone (development)

1. **Build the dev client** (do this when dependencies or native code change):
   ```bash
   eas build -p ios --profile development
   ```
2. Install the app from the build link (or QR code) on your iPhone.
3. **Start Metro** (phone and Mac on the same Wi‑Fi):
   ```bash
   npx expo start --dev-client
   ```
4. Open the app on your phone; it will load the JS bundle from Metro.

---

## Push to TestFlight

1. **Build a production iOS app** (use `--clear-cache` if you hit Hermes dSYM upload errors):
   ```bash
   eas build -p ios --profile production
   ```
   If you see "Upload Symbols" / Hermes dSYM errors, retry with:
   ```bash
   eas build -p ios --profile production --clear-cache
   ```
2. **Submit the latest build to TestFlight**:
   ```bash
   eas submit -p ios --latest
   ```
3. In **App Store Connect → Your App → TestFlight**, wait for processing (~10–30 min), then add internal or external testers.

---

## Prerequisites

- [EAS CLI](https://docs.expo.dev/build/setup/): `npm i -g eas-cli` and `eas login`
- App record in App Store Connect for `com.safewave.forbusiness`
