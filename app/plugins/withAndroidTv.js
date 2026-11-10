// Expo config plugin: Amazon Fire TV Stick (Fire OS) & Android TV compatibility.
//
// 1. Declares android.hardware.touchscreen as NOT required so Fire TV / Android TV
//    stores and devices accept the APK/AAB.
// 2. Declares android.software.leanback as optional (required="false") so the same
//    build runs on both TVs (Fire TV Stick, Google TV) and phones/tablets.
// 3. Adds category LEANBACK_LAUNCHER to MainActivity and sets android:banner
//    so the app icon/banner appears natively on Fire TV & Android TV home screens.
// 4. Unlocks screenOrientation ("unspecified") so Fire TV displays in 16:9 widescreen
//    landscape instead of forcing portrait mode.
// 5. Forwards Fire TV Remote D-Pad and Media Play/Pause keys to JS via
//    DeviceEventEmitter ("HebigatTvKey").

const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
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

function withTvManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    ensureUsesFeature(manifest, 'android.hardware.touchscreen', 'false');
    ensureUsesFeature(manifest, 'android.software.leanback', 'false');
    ensureUsesFeature(manifest, 'android.hardware.wifi', 'false');

    const app = manifest.application?.[0];
    if (app) {
      app.$['android:banner'] = '@drawable/tv_banner';

      const mainActivity = app.activity?.find(
        (a) =>
          a.$?.['android:name'] === '.MainActivity' ||
          a.$?.['android:name']?.endsWith('.MainActivity'),
      );
      if (mainActivity) {
        mainActivity.$['android:screenOrientation'] = 'unspecified';

        if (!mainActivity['intent-filter']) {
          mainActivity['intent-filter'] = [];
        }
        const launcherFilter = mainActivity['intent-filter'].find((f) =>
          f.action?.some(
            (act) => act.$?.['android:name'] === 'android.intent.action.MAIN',
          ),
        );
        if (launcherFilter) {
          if (!launcherFilter.category) launcherFilter.category = [];
          const hasLeanback = launcherFilter.category.some(
            (c) =>
              c.$?.['android:name'] ===
              'android.intent.category.LEANBACK_LAUNCHER',
          );
          if (!hasLeanback) {
            launcherFilter.category.push({
              $: {
                'android:name': 'android.intent.category.LEANBACK_LAUNCHER',
              },
            });
          }
        }
      }
    }

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

    if (!contents.includes('HebigatTvKey')) {
      const keyHandler = `
  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    val actionName = when (keyCode) {
      KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "PLAY_PAUSE"
      KeyEvent.KEYCODE_MEDIA_PLAY -> "PLAY"
      KeyEvent.KEYCODE_MEDIA_PAUSE -> "PAUSE"
      KeyEvent.KEYCODE_MEDIA_STOP -> "STOP"
      KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "SELECT"
      KeyEvent.KEYCODE_DPAD_LEFT -> "LEFT"
      KeyEvent.KEYCODE_DPAD_RIGHT -> "RIGHT"
      KeyEvent.KEYCODE_DPAD_UP -> "UP"
      KeyEvent.KEYCODE_DPAD_DOWN -> "DOWN"
      KeyEvent.KEYCODE_MENU -> "MENU"
      else -> null
    }
    if (actionName != null && (event?.repeatCount ?: 0) == 0) {
      try {
        (application as? ReactApplication)
          ?.reactHost
          ?.currentReactContext
          ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          ?.emit("HebigatTvKey", actionName)
      } catch (_: Throwable) {}
    }
    return super.onKeyDown(keyCode, event)
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
    withTvKeyEvents(withTvBannerDrawable(withTvManifest(config))),
  );
};
