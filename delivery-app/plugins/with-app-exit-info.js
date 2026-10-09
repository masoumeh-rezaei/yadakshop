const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');

const moduleSource = `package com.yadakshop.deliveryapp

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppExitInfoModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "AppExitInfo"

  @ReactMethod
  fun consumeUserRequestedStop(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      promise.resolve(false)
      return
    }

    try {
      val activityManager =
        reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val lastExit = activityManager
        .getHistoricalProcessExitReasons(reactApplicationContext.packageName, 0, 1)
        .firstOrNull()

      if (lastExit?.reason != ApplicationExitInfo.REASON_USER_REQUESTED) {
        promise.resolve(false)
        return
      }

      val preferences = reactApplicationContext.getSharedPreferences(
        "delivery_app_exit_info",
        Context.MODE_PRIVATE,
      )
      val lastConsumedTimestamp = preferences.getLong("last_user_stop_timestamp", -1L)
      if (lastExit.timestamp <= lastConsumedTimestamp) {
        promise.resolve(false)
        return
      }

      preferences.edit().putLong("last_user_stop_timestamp", lastExit.timestamp).apply()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("APP_EXIT_INFO_ERROR", error)
    }
  }
}
`;

const packageSource = `package com.yadakshop.deliveryapp

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AppExitInfoPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(AppExitInfoModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
`;

const withAppExitInfo = (config) => {
  config = withMainApplication(config, (modConfig) => {
    if (!modConfig.modResults.contents.includes('add(DeliveryTrackingPackage())')) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /PackageList\(this\)\.packages\.apply \{/,
        'PackageList(this).packages.apply {\n          add(AppExitInfoPackage())\n          add(DeliveryTrackingPackage())',
      );
    }
    return modConfig;
  });

  config = withAppBuildGradle(config, (modConfig) => {
    const dependency = 'implementation("com.google.android.gms:play-services-location:21.0.1")';
    if (!modConfig.modResults.contents.includes(dependency)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${dependency}`,
      );
    }
    return modConfig;
  });

  config = withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const permissions = manifest['uses-permission'] || (manifest['uses-permission'] = []);
    for (const name of [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ]) {
      if (!permissions.some((item) => item.$['android:name'] === name)) {
        permissions.push({ $: { 'android:name': name } });
      }
    }

    const application = manifest.application[0];
    application.service = application.service || [];
    if (!application.service.some((item) => item.$['android:name'] === '.DeliveryLocationService')) {
      application.service.push({
        $: {
          'android:name': '.DeliveryLocationService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'location',
          'android:stopWithTask': 'false',
        },
      });
    }
    application.receiver = application.receiver || [];
    if (!application.receiver.some((item) => item.$['android:name'] === '.TrackingBootReceiver')) {
      application.receiver.push({
        $: {
          'android:name': '.TrackingBootReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } }] }],
      });
    }
    return modConfig;
  });

  return withDangerousMod(config, ['android', async (modConfig) => {
    const packageName = AndroidConfig.Package.getPackage(modConfig);
    const javaDirectory = path.join(
      modConfig.modRequest.platformProjectRoot,
      'app',
      'src',
      'main',
      'java',
      ...packageName.split('.'),
    );
    await fs.promises.mkdir(javaDirectory, { recursive: true });
    const trackerSourceDirectory = path.join(__dirname, 'android-tracker');
    const trackerSources = await fs.promises.readdir(trackerSourceDirectory);
    await Promise.all([
      fs.promises.writeFile(path.join(javaDirectory, 'AppExitInfoModule.kt'), moduleSource),
      fs.promises.writeFile(path.join(javaDirectory, 'AppExitInfoPackage.kt'), packageSource),
      ...trackerSources
        .filter((fileName) => fileName.endsWith('.kt'))
        .map((fileName) => fs.promises.copyFile(
          path.join(trackerSourceDirectory, fileName),
          path.join(javaDirectory, fileName),
        )),
    ]);
    return modConfig;
  }]);
};

module.exports = withAppExitInfo;
