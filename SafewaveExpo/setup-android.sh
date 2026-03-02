#!/bin/bash

# Safewave Android Setup Script
# This script sets up the Android-specific features (installed apps + notification listener)

echo "🚀 Setting up Safewave Android features..."
echo ""

# Check if we're in the SafewaveExpo directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the SafewaveExpo directory"
    exit 1
fi

# Step 1: Install dependencies
echo "📦 Step 1: Installing react-native-installed-apps..."
npm install react-native-installed-apps
echo "✅ Dependencies installed"
echo ""

# Step 2: Clean prebuild
echo "🧹 Step 2: Cleaning old build..."
rm -rf android/
echo "✅ Clean complete"
echo ""

# Step 3: Run prebuild
echo "🔨 Step 3: Running prebuild to generate native code..."
npx expo prebuild --platform android
echo "✅ Prebuild complete"
echo ""

# Step 4: Verify files were created
echo "🔍 Step 4: Verifying generated files..."

if [ -f "android/app/src/main/java/com/safewave/forbusiness/NotificationListener.java" ]; then
    echo "✅ NotificationListener.java created"
else
    echo "❌ NotificationListener.java NOT found"
fi

if grep -q "NotificationListener" android/app/src/main/AndroidManifest.xml; then
    echo "✅ NotificationListener service added to manifest"
else
    echo "❌ NotificationListener NOT in manifest"
fi

if grep -q "BIND_NOTIFICATION_LISTENER_SERVICE" android/app/src/main/AndroidManifest.xml; then
    echo "✅ Notification permission added"
else
    echo "❌ Notification permission NOT found"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📱 Next steps:"
echo "1. Build and run: npx expo run:android --device"
echo "2. When app opens, grant notification access permission"
echo "3. Test by adding an app in the Alerts screen"
echo ""
echo "💡 Troubleshooting:"
echo "   - If installed apps don't show: Check logcat for errors"
echo "   - If notifications don't work: Grant notification access in Settings"
echo "   - View logs: adb logcat | grep -E 'NotificationListener|InstalledApps'"
echo ""
