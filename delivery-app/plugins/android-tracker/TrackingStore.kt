package com.yadakshop.deliveryapp

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class QueuedLocation(
  val id: String,
  val latitude: Double,
  val longitude: Double,
  val accuracy: Double?,
  val recordedAt: String,
)

object TrackingStore {
  private const val PREFS = "delivery_native_tracking"
  private const val KEY_ALIAS = "delivery_tracking_token"
  private const val MAX_QUEUE_SIZE = 10_000
  private val lock = Any()

  fun configure(context: Context, token: String, apiUrl: String) {
    val encryptedToken = encrypt(token)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean("enabled", true)
      .putString("api_url", apiUrl.trimEnd('/'))
      .putString("token", encryptedToken)
      .apply()
  }

  fun disable(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean("enabled", false)
      .remove("token")
      .apply()
  }

  fun isEnabled(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", false)

  fun apiUrl(context: Context): String? =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("api_url", null)

  fun token(context: Context): String? {
    val value = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", null)
      ?: return null
    return runCatching { decrypt(value) }.getOrNull()
  }

  fun setLastFix(context: Context, timestamp: Long) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong("last_fix", timestamp).apply()
  }

  fun setLastUpload(context: Context, timestamp: Long) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong("last_upload", timestamp).apply()
  }

  fun lastFix(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("last_fix", 0L)

  fun lastUpload(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("last_upload", 0L)

  private fun queueFile(context: Context) = File(context.filesDir, "pending_locations.json")

  fun enqueue(context: Context, location: QueuedLocation) = synchronized(lock) {
    val queue = readQueue(context)
    queue.put(JSONObject().apply {
      put("id", location.id)
      put("latitude", location.latitude)
      put("longitude", location.longitude)
      put("accuracy", location.accuracy ?: JSONObject.NULL)
      put("recordedAt", location.recordedAt)
    })
    val trimmed = JSONArray()
    val start = (queue.length() - MAX_QUEUE_SIZE).coerceAtLeast(0)
    for (index in start until queue.length()) trimmed.put(queue.getJSONObject(index))
    writeQueue(context, trimmed)
  }

  fun peek(context: Context): QueuedLocation? = synchronized(lock) {
    val queue = readQueue(context)
    if (queue.length() == 0) return@synchronized null
    val item = queue.getJSONObject(0)
    QueuedLocation(
      item.getString("id"), item.getDouble("latitude"), item.getDouble("longitude"),
      if (item.isNull("accuracy")) null else item.getDouble("accuracy"),
      item.getString("recordedAt"),
    )
  }

  fun remove(context: Context, id: String) = synchronized(lock) {
    val queue = readQueue(context)
    val remaining = JSONArray()
    for (index in 0 until queue.length()) {
      val item = queue.getJSONObject(index)
      if (item.getString("id") != id) remaining.put(item)
    }
    writeQueue(context, remaining)
  }

  fun queueSize(context: Context) = synchronized(lock) { readQueue(context).length() }

  private fun readQueue(context: Context): JSONArray = runCatching {
    val file = queueFile(context)
    if (file.exists()) JSONArray(file.readText()) else JSONArray()
  }.getOrElse { JSONArray() }

  private fun writeQueue(context: Context, queue: JSONArray) {
    val target = queueFile(context)
    val temporary = File(context.filesDir, "pending_locations.tmp")
    temporary.writeText(queue.toString())
    if (!temporary.renameTo(target)) {
      target.writeText(queue.toString())
      temporary.delete()
    }
  }

  fun newId() = UUID.randomUUID().toString()

  private fun key(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
    ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .build())
    return generator.generateKey()
  }

  private fun encrypt(value: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val payload = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(payload, Base64.NO_WRAP)
  }

  private fun decrypt(value: String): String {
    val payload = Base64.decode(value, Base64.NO_WRAP)
    val iv = payload.copyOfRange(0, 12)
    val encrypted = payload.copyOfRange(12, payload.size)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
    return String(cipher.doFinal(encrypted), Charsets.UTF_8)
  }
}
