const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
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
    if (!modConfig.modResults.contents.includes('add(AppExitInfoPackage())')) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /PackageList\(this\)\.packages\.apply \{/,
        'PackageList(this).packages.apply {\n          add(AppExitInfoPackage())',
      );
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
    await Promise.all([
      fs.promises.writeFile(path.join(javaDirectory, 'AppExitInfoModule.kt'), moduleSource),
      fs.promises.writeFile(path.join(javaDirectory, 'AppExitInfoPackage.kt'), packageSource),
    ]);
    return modConfig;
  }]);
};

module.exports = withAppExitInfo;
