// Expo config plugin: Amazon Fire TV Stick (Fire OS) & Android TV compatibility.
//
// 1. Declares non-TV hardware features (touchscreen, faketouch, telephony, camera,
//    gps, microphone, wifi, leanback) as android:required="false" so Fire OS and
//    Google TV accept and launch the APK/AAB without hardware rejections.
// 2. Adds both a combined MAIN + LAUNCHER + LEANBACK_LAUNCHER intent-filter and a
//    dedicated MAIN + LEANBACK_LAUNCHER intent-filter on MainActivity, plus sets
//    android:banner="@drawable/tv_banner" on both <application> and <activity>.
// 3. Sets android:extractNativeLibs="true" and expo.useLegacyPackaging=true so
//    32-bit Fire OS devices cleanly extract native .so libraries on install.
// 4. Disables edgeToEdgeEnabled and wraps SplashScreen + CastContext initialization
//    in try/catch so Fire OS (which lacks Google Play Services) never crashes on boot.
// 5. Overrides MainActivity.dispatchKeyEvent to forward all TV remote D-Pad and
//    Media keys to JS via DeviceEventEmitter ("HebigatTvKey") before any ScrollView
//    can swallow them.

const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
  withMainActivity,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function ensureUsesFeature(manifest, name, required = 'false') {
  if (!manifest['uses-feature']) {
    manifest['uses-feature'] = [];
  }
  const existing = manifest['uses-feature'].find(
    (item) => item.$?.['android:name'] === name,
  );
  if (existing) {
    existing.$['android:required'] = required;
  } else {
    manifest['uses-feature'].push({
      $: {
        'android:name': name,
        'android:required': required,
      },
    });
  }
}

function setMetaData(app, name, value) {
  if (!app['meta-data']) {
    app['meta-data'] = [];
  }
  const existing = app['meta-data'].find((m) => m.$?.['android:name'] === name);
  if (existing) {
    existing.$['android:value'] = value;
  } else {
    app['meta-data'].push({
      $: {
        'android:name': name,
        'android:value': value,
      },
    });
  }
}

function withTvManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    const optionalFeatures = [
      'android.hardware.touchscreen',
      'android.software.leanback',
      'android.hardware.wifi',
      'android.hardware.faketouch',
      'android.hardware.telephony',
      'android.hardware.camera',
      'android.hardware.microphone',
      'android.hardware.location',
      'android.hardware.location.gps',
    ];
    for (const feat of optionalFeatures) {
      ensureUsesFeature(manifest, feat, 'false');
    }

    const app = manifest.application?.[0];
    if (app) {
      app.$['android:banner'] = '@drawable/tv_banner';
      app.$['android:extractNativeLibs'] = 'true';

      // Prevent expo-updates from blocking or crashing startup on sideloaded Fire TV builds
      setMetaData(app, 'expo.modules.updates.ENABLED', 'false');
      setMetaData(app, 'expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH', 'NEVER');

      const mainActivity = app.activity?.find(
        (a) =>
          a.$?.['android:name'] === '.MainActivity' ||
          a.$?.['android:name']?.endsWith('.MainActivity'),
      );
      if (mainActivity) {
        mainActivity.$['android:screenOrientation'] = 'unspecified';
        mainActivity.$['android:banner'] = '@drawable/tv_banner';
        mainActivity.$['android:exported'] = 'true';

        if (!mainActivity['intent-filter']) {
          mainActivity['intent-filter'] = [];
        }

        // Keep non-MAIN intent filters (like deep links)
        const nonMainFilters = mainActivity['intent-filter'].filter(
          (f) =>
            !f.action?.some(
              (act) => act.$?.['android:name'] === 'android.intent.action.MAIN',
            ),
        );

        // Add standard mobile LAUNCHER filter + dedicated LEANBACK_LAUNCHER filter for Fire OS / Android TV
        mainActivity['intent-filter'] = [
          {
            action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
            category: [
              { $: { 'android:name': 'android.intent.category.LAUNCHER' } },
              { $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } },
            ],
          },
          {
            action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
            category: [
              { $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } },
            ],
          },
          ...nonMainFilters,
        ];
      }
    }

    return cfg;
  });
}

function withTvGradleProperties(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const setProp = (key, value) => {
      const idx = props.findIndex((p) => p.type === 'property' && p.key === key);
      if (idx !== -1) {
        props[idx].value = value;
      } else {
        props.push({ type: 'property', key, value });
      }
    };
    setProp('expo.useLegacyPackaging', 'true');
    setProp('edgeToEdgeEnabled', 'false');
    return cfg;
  });
}

function withTvBannerDrawable(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidRoot = cfg.modRequest.platformProjectRoot;
      const srcBanner = path.join(projectRoot, 'assets', 'tv-banner.png');
      if (fs.existsSync(srcBanner)) {
        for (const dirName of ['drawable', 'drawable-xhdpi']) {
          const destDir = path.join(
            androidRoot,
            'app',
            'src',
            'main',
            'res',
            dirName,
          );
          fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(srcBanner, path.join(destDir, 'tv_banner.png'));
        }
      }
      return cfg;
    },
  ]);
}

function withTvKeyEvents(config) {
  return withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes('import android.view.KeyEvent')) {
      contents = contents.replace(
        'import android.os.Bundle',
        'import android.os.Bundle\nimport android.view.KeyEvent\nimport com.facebook.react.ReactApplication\nimport com.facebook.react.modules.core.DeviceEventManagerModule',
      );
    }

    // Guard SplashScreenManager and RNGCCastContext against crashing on Fire OS (no Play Services)
    contents = contents.replace(
      /^\s*SplashScreenManager\.registerOnActivity\(this\)\s*$/m,
      '    try { SplashScreenManager.registerOnActivity(this) } catch (_: Throwable) {}',
    );
    contents = contents.replace(
      /^\s*RNGCCastContext\.getSharedInstance\(this\)\s*$/m,
      '    try { RNGCCastContext.getSharedInstance(this) } catch (_: Throwable) {}',
    );

    if (!contents.includes('HebigatTvKey')) {
      const keyHandler = `
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
      val actionName = when (event.keyCode) {
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "PLAY_PAUSE"
        KeyEvent.KEYCODE_MEDIA_PLAY -> "PLAY"
        KeyEvent.KEYCODE_MEDIA_PAUSE -> "PAUSE"
        KeyEvent.KEYCODE_MEDIA_STOP -> "STOP"
        KeyEvent.KEYCODE_DPAD_CENTER,
        KeyEvent.KEYCODE_ENTER,
        KeyEvent.KEYCODE_NUMPAD_ENTER,
        KeyEvent.KEYCODE_SPACE,
        KeyEvent.KEYCODE_BUTTON_A -> "SELECT"
        KeyEvent.KEYCODE_DPAD_LEFT -> "LEFT"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "RIGHT"
        KeyEvent.KEYCODE_DPAD_UP -> "UP"
        KeyEvent.KEYCODE_DPAD_DOWN -> "DOWN"
        KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_SETTINGS -> "MENU"
        else -> null
      }
      if (actionName != null) {
        try {
          (application as? ReactApplication)
            ?.reactHost
            ?.currentReactContext
            ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit("HebigatTvKey", actionName)
        } catch (_: Throwable) {}
      }
    }
    return super.dispatchKeyEvent(event)
  }
`;
      const lastBrace = contents.lastIndexOf('}');
      if (lastBrace !== -1) {
        contents =
          contents.slice(0, lastBrace) + keyHandler + contents.slice(lastBrace);
      }
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes('ANDROID_KEYSTORE_PATH')) {
      contents = contents.replace(
        /signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\}\s*\}/,
        `signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (System.getenv("ANDROID_KEYSTORE_PATH")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
    }`,
      );
      contents = contents.replace(
        /release\s*\{\s*\/\/\s*Caution![\s\S]*?signingConfig\s+signingConfigs\.debug/,
        `release {\n            signingConfig signingConfigs.release`,
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = function withAndroidTv(config) {
  return withReleaseSigning(
    withTvGradleProperties(
      withTvKeyEvents(withTvBannerDrawable(withTvManifest(config))),
    ),
  );
};
