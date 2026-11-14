package app.whatnext.addon

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/**
 * Share, copy or save a picture the app has drawn (the taste report). The app sends the PNG as base64 text.
 * share and copy go through a file in the app's own cache and the FileProvider that Capacitor already declares (${applicationId}.fileprovider),
 * save writes to Pictures/What Next with MediaStore (no storage permission on Android 10 and later).
 * Every method can fail; the app then falls back to what the web view can do and says so.
 */
@CapacitorPlugin(name = "WnImage")
class WnImagePlugin : Plugin() {

    private fun bytes(call: PluginCall): ByteArray? {
        val data = call.getString("data") ?: return null
        return try { Base64.decode(data, Base64.DEFAULT) } catch (e: IllegalArgumentException) { null }
    }

    // One file in the cache; older pictures are removed so the cache never grows.
    private fun cacheFile(data: ByteArray): File {
        val dir = File(context.cacheDir, "wn_share")
        dir.mkdirs()
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, "what-next-taste.png")
        file.writeBytes(data)
        return file
    }

    @PluginMethod
    fun share(call: PluginCall) {
        try {
            val data = bytes(call) ?: return call.reject("no picture")
            val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", cacheFile(data))
            val send = Intent(Intent.ACTION_SEND)
            send.type = "image/png"
            send.putExtra(Intent.EXTRA_STREAM, uri)
            val text = call.getString("text")
            if (!text.isNullOrEmpty()) send.putExtra(Intent.EXTRA_TEXT, text)
            send.clipData = ClipData.newRawUri("", uri)
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            val chooser = Intent.createChooser(send, call.getString("title") ?: "Share")
            activity.runOnUiThread {
                try {
                    activity.startActivity(chooser)
                    call.resolve()
                } catch (e: Exception) {
                    call.reject("share failed")
                }
            }
        } catch (e: Exception) {
            call.reject("share failed")
        }
    }

    @PluginMethod
    fun copy(call: PluginCall) {
        try {
            val data = bytes(call) ?: return call.reject("no picture")
            val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", cacheFile(data))
            activity.runOnUiThread {
                try {
                    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newUri(context.contentResolver, "Taste report", uri))
                    call.resolve()
                } catch (e: Exception) {
                    call.reject("copy failed")
                }
            }
        } catch (e: Exception) {
            call.reject("copy failed")
        }
    }

    @PluginMethod
    fun save(call: PluginCall) {
        try {
            val data = bytes(call) ?: return call.reject("no picture")
            val name = (call.getString("name") ?: "what-next-taste") + "-" + (System.currentTimeMillis() / 1000) + ".png"
            val values = ContentValues()
            values.put(MediaStore.Images.Media.DISPLAY_NAME, name)
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            if (Build.VERSION.SDK_INT >= 29) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/What Next")
                values.put(MediaStore.Images.Media.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return call.reject("save failed")
            val out = resolver.openOutputStream(uri)
            if (out == null) {
                resolver.delete(uri, null, null)
                return call.reject("save failed")
            }
            out.use { it.write(data) }
            if (Build.VERSION.SDK_INT >= 29) {
                val done = ContentValues()
                done.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(uri, done, null, null)
            }
            val result = JSObject()
            result.put("name", name)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("save failed")
        }
    }
}
