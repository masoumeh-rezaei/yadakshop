package com.yadakshop.deliveryapp

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class DeliveryLocationService : Service() {
  companion object {
    const val ACTION_START = "com.yadakshop.deliveryapp.START_TRACKING"
    const val ACTION_STOP = "com.yadakshop.deliveryapp.STOP_TRACKING"
    const val CHANNEL_ID = "delivery_location_tracking"
    const val NOTIFICATION_ID = 2401
    const val UPDATE_INTERVAL_MS = 15_000L
    const val MIN_UPDATE_INTERVAL_MS = 10_000L
    @Volatile var running = false
  }

  private lateinit var locationClient: FusedLocationProviderClient
  private var callback: LocationCallback? = null
  private var worker: ScheduledExecutorService? = null
  private val uploading = AtomicBoolean(false)

  override fun onCreate() {
    super.onCreate()
    locationClient = LocationServices.getFusedLocationProviderClient(this)
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopTracking()
      return START_NOT_STICKY
    }
    if (!TrackingStore.isEnabled(this) || TrackingStore.token(this) == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    startForeground(NOTIFICATION_ID, buildNotification())
    startTracking()
    return START_STICKY
  }

  private fun startTracking() {
    if (running) return
    if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
      ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      stopSelf()
      return
    }

    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
      .setMinUpdateIntervalMillis(MIN_UPDATE_INTERVAL_MS)
      .setMaxUpdateDelayMillis(0L)
      .setWaitForAccurateLocation(false)
      .build()
    callback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        for (location in result.locations) {
          val item = QueuedLocation(
            TrackingStore.newId(), location.latitude, location.longitude,
            if (location.hasAccuracy()) location.accuracy.toDouble() else null,
            isoTimestamp(location.time),
          )
          TrackingStore.enqueue(this@DeliveryLocationService, item)
          TrackingStore.setLastFix(this@DeliveryLocationService, location.time)
        }
        flushQueue()
      }
    }
    locationClient.requestLocationUpdates(request, callback!!, Looper.getMainLooper())
    running = true
    worker = Executors.newSingleThreadScheduledExecutor().also {
      it.scheduleWithFixedDelay({ flushQueue() }, 0L, 30L, TimeUnit.SECONDS)
    }
  }

  private fun flushQueue() {
    if (!uploading.compareAndSet(false, true)) return
    val executor = worker
    if (executor == null || executor.isShutdown) {
      uploading.set(false)
      return
    }
    executor.execute {
      try {
        while (TrackingStore.isEnabled(this)) {
          val location = TrackingStore.peek(this) ?: break
          when (upload(location)) {
            UploadResult.SUCCESS -> {
              TrackingStore.remove(this, location.id)
              TrackingStore.setLastUpload(this, System.currentTimeMillis())
            }
            UploadResult.UNAUTHORIZED -> {
              TrackingStore.disable(this)
              stopSelf()
              break
            }
            UploadResult.RETRY -> break
          }
        }
      } finally {
        uploading.set(false)
      }
    }
  }

  private enum class UploadResult { SUCCESS, UNAUTHORIZED, RETRY }

  private fun upload(location: QueuedLocation): UploadResult {
    val apiUrl = TrackingStore.apiUrl(this) ?: return UploadResult.RETRY
    val token = TrackingStore.token(this) ?: return UploadResult.UNAUTHORIZED
    return try {
      val connection = URL("$apiUrl/api/locations").openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = 10_000
      connection.readTimeout = 10_000
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer $token")
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
      val body = JSONObject().apply {
        put("latitude", location.latitude)
        put("longitude", location.longitude)
        put("accuracy", location.accuracy ?: JSONObject.NULL)
        put("recordedAt", location.recordedAt)
      }.toString()
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = connection.responseCode
      connection.disconnect()
      when {
        code in 200..299 -> UploadResult.SUCCESS
        code == 401 -> UploadResult.UNAUTHORIZED
        else -> UploadResult.RETRY
      }
    } catch (_: Exception) {
      UploadResult.RETRY
    }
  }

  private fun stopTracking() {
    TrackingStore.disable(this)
    callback?.let { locationClient.removeLocationUpdates(it) }
    callback = null
    running = false
    worker?.shutdownNow()
    worker = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    callback?.let { locationClient.removeLocationUpdates(it) }
    callback = null
    running = false
    worker?.shutdownNow()
    worker = null
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // START_STICKY plus stopWithTask=false keeps/recreates the service after Recents removal.
    super.onTaskRemoved(rootIntent)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun isoTimestamp(timestamp: Long): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(timestamp))

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID, "ردیابی موقعیت پیک", NotificationManager.IMPORTANCE_LOW,
      ).apply { description = "اعلان دائمی هنگام ارسال موقعیت پیک" }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
    .setSmallIcon(applicationInfo.icon)
    .setContentTitle("سامانه پیک فعال است")
    .setContentText("موقعیت شما در حال ثبت و ارسال است")
    .setOngoing(true)
    .setOnlyAlertOnce(true)
    .setCategory(NotificationCompat.CATEGORY_SERVICE)
    .setContentIntent(PendingIntent.getActivity(
      this, 0, packageManager.getLaunchIntentForPackage(packageName),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    ))
    .build()
}
