package com.yadakshop.deliveryapp

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DeliveryTrackingModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {
  override fun getName() = "DeliveryTracking"

  @ReactMethod
  fun start(token: String, apiUrl: String, promise: Promise) {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("LOCATION_PERMISSION_REQUIRED", "Location permission is required")
      return
    }
    try {
      TrackingStore.configure(context, token, apiUrl)
      ContextCompat.startForegroundService(context, Intent(context, DeliveryLocationService::class.java).apply {
        action = DeliveryLocationService.ACTION_START
      })
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("TRACKING_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    TrackingStore.disable(context)
    context.startService(Intent(context, DeliveryLocationService::class.java).apply {
      action = DeliveryLocationService.ACTION_STOP
    })
    promise.resolve(null)
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    promise.resolve(Arguments.createMap().apply {
      putBoolean("active", DeliveryLocationService.running || TrackingStore.isEnabled(context))
      putBoolean("serviceRunning", DeliveryLocationService.running)
      putInt("queuedLocations", TrackingStore.queueSize(context))
      putDouble("lastFixAt", TrackingStore.lastFix(context).toDouble())
      putDouble("lastUploadAt", TrackingStore.lastUpload(context).toDouble())
    })
  }
}
