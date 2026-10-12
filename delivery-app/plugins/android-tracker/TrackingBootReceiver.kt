package com.yadakshop.deliveryapp

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat

class TrackingBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != Intent.ACTION_BOOT_COMPLETED || !TrackingStore.isEnabled(context)) return
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    if (!fine && !coarse) return
    runCatching {
      ContextCompat.startForegroundService(context, Intent(context, DeliveryLocationService::class.java).apply {
        action = DeliveryLocationService.ACTION_START
      })
    }
  }
}
