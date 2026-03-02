const { withAppDelegate } = require('@expo/config-plugins');

/**
 * Expo config plugin that adds Firebase initialization to the iOS AppDelegate.
 *
 * React Native Firebase v23 does not ship its own Expo config plugin, so
 * native FirebaseApp.configure() / [FIRApp configure] must be injected
 * manually. Without this call the JS-side auth(), getFirestore(), etc. will
 * throw: "No Firebase App '[DEFAULT]' has been created"
 *
 * Handles both Swift (Expo SDK 54+) and Objective-C AppDelegates.
 */
function withFirebaseInit(config) {
  return withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;
    const isSwift = config.modResults.language === 'swift' ||
                    contents.includes('import Expo');

    if (isSwift) {
      // 1. Add `import Firebase` if not already present
      if (!contents.includes('import Firebase')) {
        contents = 'import Firebase\n' + contents;
      }

      // 2. Add `FirebaseApp.configure()` inside didFinishLaunchingWithOptions
      if (!contents.includes('FirebaseApp.configure()')) {
        const marker = 'didFinishLaunchingWithOptions';
        const idx = contents.indexOf(marker);
        if (idx !== -1) {
          const braceIdx = contents.indexOf('{', idx);
          if (braceIdx !== -1) {
            contents =
              contents.slice(0, braceIdx + 1) +
              '\n    FirebaseApp.configure()' +
              contents.slice(braceIdx + 1);
          }
        }
      }
    } else {
      // Objective-C path
      if (!contents.includes('Firebase.h') && !contents.includes('FirebaseCore')) {
        const importRegex = /#import\s+[<"][^">\n]+[>"]/g;
        const matches = [...contents.matchAll(importRegex)];

        if (matches.length > 0) {
          const lastMatch = matches[matches.length - 1];
          const insertPos = lastMatch.index + lastMatch[0].length;
          contents =
            contents.slice(0, insertPos) +
            '\n#import <Firebase.h>' +
            contents.slice(insertPos);
        } else {
          contents = '#import <Firebase.h>\n' + contents;
        }
      }

      if (!contents.includes('[FIRApp configure]')) {
        const marker = 'didFinishLaunchingWithOptions';
        const idx = contents.indexOf(marker);
        if (idx !== -1) {
          const braceIdx = contents.indexOf('{', idx);
          if (braceIdx !== -1) {
            contents =
              contents.slice(0, braceIdx + 1) +
              '\n  [FIRApp configure];' +
              contents.slice(braceIdx + 1);
          }
        }
      }
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withFirebaseInit;
