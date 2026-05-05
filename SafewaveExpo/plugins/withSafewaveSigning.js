const { withAppBuildGradle, withAndroidManifest } = require('@expo/config-plugins');

const DEBUG_ONLY_SIGNING_CONFIGS = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

const WITH_RELEASE_SIGNING_CONFIGS = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (project.hasProperty('SAFEWAVE_UPLOAD_STORE_FILE')) {
                storeFile file(SAFEWAVE_UPLOAD_STORE_FILE)
                storePassword SAFEWAVE_UPLOAD_STORE_PASSWORD
                keyAlias SAFEWAVE_UPLOAD_KEY_ALIAS
                keyPassword SAFEWAVE_UPLOAD_KEY_PASSWORD
            }
        }
    }`;

const RELEASE_BUILDTYPE_DEBUG_LINE = `            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const RELEASE_BUILDTYPE_TERNARY_LINE = `            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig project.hasProperty('SAFEWAVE_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`;

function patchBuildGradle(contents) {
  let out = contents;

  if (out.includes(DEBUG_ONLY_SIGNING_CONFIGS)) {
    out = out.replace(DEBUG_ONLY_SIGNING_CONFIGS, WITH_RELEASE_SIGNING_CONFIGS);
  }

  if (out.includes(RELEASE_BUILDTYPE_DEBUG_LINE)) {
    out = out.replace(RELEASE_BUILDTYPE_DEBUG_LINE, RELEASE_BUILDTYPE_TERNARY_LINE);
  }

  return out;
}

function patchManifestNeverForLocation(androidManifest) {
  const perms = androidManifest.manifest['uses-permission'] || [];
  for (const p of perms) {
    if (p.$ && p.$['android:name'] === 'android.permission.BLUETOOTH_SCAN') {
      p.$['android:usesPermissionFlags'] = 'neverForLocation';
    }
  }
  return androidManifest;
}

module.exports = function withSafewaveSigning(config) {
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = patchBuildGradle(cfg.modResults.contents);
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = patchManifestNeverForLocation(cfg.modResults);
    return cfg;
  });

  return config;
};
