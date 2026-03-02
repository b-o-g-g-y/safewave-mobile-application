const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Creates the RNInstalledApplicationModule.java file
 */
function createInstalledAppsModule(config, projectRoot) {
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

      // Create the Module file
      const modulePath = path.join(
        mainApplicationPath,
        'RNInstalledApplicationModule.java'
      );

      const moduleContent = `package ${packageName};

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Native module to get installed applications on Android
 */
public class RNInstalledApplicationModule extends ReactContextBaseJavaModule {
    private static final String TAG = "RNInstalledApplication";
    private static final int ICON_SIZE = 96; // Icon size in pixels

    public RNInstalledApplicationModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "RNInstalledApplication";
    }

    /**
     * Get all non-system apps installed on the device
     */
    @ReactMethod
    public void getNonSystemApps(Promise promise) {
        try {
            PackageManager pm = getReactApplicationContext().getPackageManager();
            List<PackageInfo> packages = pm.getInstalledPackages(0);
            WritableArray appList = Arguments.createArray();
            
            Log.d(TAG, "Total installed packages: " + packages.size());

            List<AppInfo> nonSystemApps = new ArrayList<>();

            for (PackageInfo packageInfo : packages) {
                ApplicationInfo appInfo = packageInfo.applicationInfo;
                
                // Filter out system apps and our own app
                if (isSystemApp(appInfo) || packageInfo.packageName.equals(getReactApplicationContext().getPackageName())) {
                    continue;
                }

                try {
                    String appName = pm.getApplicationLabel(appInfo).toString();
                    String packageName = packageInfo.packageName;
                    String iconBase64 = getAppIconBase64(pm, appInfo);

                    AppInfo app = new AppInfo(appName, packageName, iconBase64);
                    nonSystemApps.add(app);
                } catch (Exception e) {
                    Log.w(TAG, "Error getting info for package: " + packageInfo.packageName, e);
                }
            }

            // Sort alphabetically by app name
            Collections.sort(nonSystemApps, new Comparator<AppInfo>() {
                @Override
                public int compare(AppInfo a1, AppInfo a2) {
                    return a1.appName.compareToIgnoreCase(a2.appName);
                }
            });

            // Convert to WritableArray
            for (AppInfo app : nonSystemApps) {
                WritableMap appMap = Arguments.createMap();
                appMap.putString("appName", app.appName);
                appMap.putString("packageName", app.packageName);
                appMap.putString("icon", app.iconBase64);
                appList.pushMap(appMap);
            }

            Log.d(TAG, "Non-system apps found: " + nonSystemApps.size());
            promise.resolve(appList);
        } catch (Exception e) {
            Log.e(TAG, "Error getting installed apps", e);
            promise.reject("ERROR", "Failed to get installed apps: " + e.getMessage(), e);
        }
    }

    /**
     * Check if an app is a system app
     */
    private boolean isSystemApp(ApplicationInfo appInfo) {
        return (appInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0 ||
               (appInfo.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0;
    }

    /**
     * Get app icon as base64 encoded string
     */
    private String getAppIconBase64(PackageManager pm, ApplicationInfo appInfo) {
        try {
            Drawable icon = pm.getApplicationIcon(appInfo);
            Bitmap bitmap = drawableToBitmap(icon);
            
            // Scale down if needed
            if (bitmap.getWidth() > ICON_SIZE || bitmap.getHeight() > ICON_SIZE) {
                bitmap = Bitmap.createScaledBitmap(bitmap, ICON_SIZE, ICON_SIZE, true);
            }

            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, byteArrayOutputStream);
            byte[] byteArray = byteArrayOutputStream.toByteArray();
            
            return Base64.encodeToString(byteArray, Base64.NO_WRAP);
        } catch (Exception e) {
            Log.w(TAG, "Error getting icon for: " + appInfo.packageName, e);
            return "";
        }
    }

    /**
     * Convert Drawable to Bitmap
     */
    private Bitmap drawableToBitmap(Drawable drawable) {
        if (drawable instanceof BitmapDrawable) {
            BitmapDrawable bitmapDrawable = (BitmapDrawable) drawable;
            if (bitmapDrawable.getBitmap() != null) {
                return bitmapDrawable.getBitmap();
            }
        }

        Bitmap bitmap;
        if (drawable.getIntrinsicWidth() <= 0 || drawable.getIntrinsicHeight() <= 0) {
            bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
        } else {
            bitmap = Bitmap.createBitmap(drawable.getIntrinsicWidth(), 
                                        drawable.getIntrinsicHeight(), 
                                        Bitmap.Config.ARGB_8888);
        }

        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
        drawable.draw(canvas);
        return bitmap;
    }

    /**
     * Helper class to store app info
     */
    private static class AppInfo {
        String appName;
        String packageName;
        String iconBase64;

        AppInfo(String appName, String packageName, String iconBase64) {
            this.appName = appName;
            this.packageName = packageName;
            this.iconBase64 = iconBase64;
        }
    }
}
`;

      fs.writeFileSync(modulePath, moduleContent);
      console.log('✅ RNInstalledApplicationModule.java created successfully');

      // Create the Package file
      const packagePath2 = path.join(
        mainApplicationPath,
        'RNInstalledApplicationPackage.java'
      );

      const packageContent = `package ${packageName};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Package to register RNInstalledApplicationModule
 */
public class RNInstalledApplicationPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new RNInstalledApplicationModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
`;

      fs.writeFileSync(packagePath2, packageContent);
      console.log('✅ RNInstalledApplicationPackage.java created successfully');

      return config;
    },
  ]);
}

/**
 * Update MainApplication to register the package (supports both Kotlin and Java)
 */
function updateMainApplication(config, projectRoot) {
  return withMainApplication(config, (config) => {
    const { modResults } = config;
    const { contents } = modResults;

    // Check if package is already imported
    if (contents.includes('RNInstalledApplicationPackage')) {
      console.log('⚠️  RNInstalledApplicationPackage already registered in MainApplication');
      return config;
    }

    const packageName = config.android?.package || 'com.safewave.forbusiness';
    const isKotlin = modResults.language === 'kt' || contents.includes('class MainApplication');

    if (isKotlin) {
      // Kotlin MainApplication
      const ktImport = `import ${packageName}.RNInstalledApplicationPackage`;

      // Add import after the last import line
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
          '\n              add(RNInstalledApplicationPackage())' +
          modResults.contents.slice(insertPosition);

        console.log('✅ RNInstalledApplicationPackage added to MainApplication (Kotlin)');
      } else {
        console.warn('⚠️  Could not find add() in Kotlin MainApplication - you may need to add it manually');
      }
    } else {
      // Java MainApplication
      const importStatement = `import ${packageName}.RNInstalledApplicationPackage;`;

      const importRegex = /import\s+[\w.]+;/g;
      const imports = contents.match(importRegex);
      if (imports && imports.length > 0) {
        const lastImport = imports[imports.length - 1];
        const lastImportIndex = contents.lastIndexOf(lastImport);
        const insertPosition = lastImportIndex + lastImport.length;

        modResults.contents =
          contents.slice(0, insertPosition) +
          '\n' + importStatement +
          contents.slice(insertPosition);
      }

      const packagesAddRegex = /packages\.add\(new\s+\w+Package\(\)\);/;
      const match = modResults.contents.match(packagesAddRegex);

      if (match) {
        const insertPosition = modResults.contents.indexOf(match[0]) + match[0].length;
        modResults.contents =
          modResults.contents.slice(0, insertPosition) +
          '\n        packages.add(new RNInstalledApplicationPackage());' +
          modResults.contents.slice(insertPosition);

        console.log('✅ RNInstalledApplicationPackage added to MainApplication (Java)');
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
const withInstalledApps = (config) => {
  const projectRoot = config._internal?.projectRoot || process.cwd();

  // Create the Java files
  config = createInstalledAppsModule(config, projectRoot);

  // Update MainApplication.java
  config = updateMainApplication(config, projectRoot);

  return config;
};

module.exports = withInstalledApps;
