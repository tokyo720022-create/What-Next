package app.whatnext.addon

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Shared helpers for the five widgets: finding resources by name, tapping through to the app, covers, times and updating all of them. */
object WnWidgetKit {
    val PROVIDERS: List<Class<*>> = listOf(WnAiringWidget::class.java, WnContinueWidget::class.java, WnUpdatesWidget::class.java, WnStreakWidget::class.java, WnPickWidget::class.java)

    // Resources are found by name, so this code does not depend on the app's generated R class.
    fun id(ctx: Context, type: String, name: String): Int = ctx.resources.getIdentifier(name, type, ctx.packageName)

    // AniList sends null for a missing value, and optString would turn that into the word "null".
    fun str(o: JSONObject?, key: String): String {
        if (o == null || o.isNull(key)) return ""
        return o.optString(key, "")
    }

    // A tap opens the app on a whatnext:// address (the app's own deep links: whatnext://media/123, whatnext://pick, whatnext://schedule).
    fun tap(ctx: Context, uri: String): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
        intent.setPackage(ctx.packageName)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(ctx, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    // Covers are downloaded, so the widget does its work on a background thread while the system waits for it.
    fun run(receiver: BroadcastReceiver, work: () -> Unit) {
        val pending = receiver.goAsync()
        Thread {
            try {
                work()
            } catch (e: Exception) {
                // a widget that cannot draw keeps showing what it showed
            } finally {
                pending.finish()
            }
        }.start()
    }

    fun widthDp(mgr: AppWidgetManager, id: Int): Int = mgr.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
    fun heightDp(mgr: AppWidgetManager, id: Int): Int = mgr.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)

    // Tell every widget on the home screen to draw again.
    fun refreshAll(ctx: Context) {
        val mgr = AppWidgetManager.getInstance(ctx)
        for (cls in PROVIDERS) {
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, cls))
            if (ids.isEmpty()) continue
            val intent = Intent(ctx, cls)
            intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            ctx.sendBroadcast(intent)
        }
    }

    // "in 35 min", "in 2h 10m", or the day and time for later.
    fun rel(at: Long, now: Long): String {
        val d = at - now
        if (d <= 0) return "now"
        if (d < 3600) return "in " + maxOf(1L, d / 60) + " min"
        if (d < 6 * 3600) return "in " + (d / 3600) + "h " + ((d % 3600) / 60) + "m"
        return SimpleDateFormat("EEE HH:mm", Locale.getDefault()).format(Date(at * 1000))
    }

    // A cover as a small bitmap with rounded corners. It is downloaded once and kept in the cache folder.
    fun cover(ctx: Context, url: String): Bitmap? {
        if (!url.startsWith("https://")) return null
        try {
            val dir = File(ctx.cacheDir, "wn_widget")
            dir.mkdirs()
            val file = File(dir, Integer.toHexString(url.hashCode()) + ".jpg")
            if (!file.exists()) {
                val bytes = download(url) ?: return null
                val bounds = BitmapFactory.Options()
                bounds.inJustDecodeBounds = true
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                var sample = 1
                while (bounds.outWidth / sample > 320) sample *= 2
                val opts = BitmapFactory.Options()
                opts.inSampleSize = sample
                val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return null
                FileOutputStream(file).use { decoded.compress(Bitmap.CompressFormat.JPEG, 85, it) }
                prune(dir)
            }
            val plain = BitmapFactory.decodeFile(file.path) ?: return null
            return rounded(plain, minOf(plain.width, plain.height) * 0.08f)
        } catch (e: Exception) {
            return null
        }
    }

    private fun download(url: String): ByteArray? {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 10000
            conn.readTimeout = 15000
            if (conn.responseCode != 200) return null
            return conn.inputStream.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }
    }

    // Keeps the cache small: the oldest covers go first.
    private fun prune(dir: File) {
        val files = dir.listFiles() ?: return
        if (files.size <= 120) return
        files.sortedBy { it.lastModified() }.take(files.size - 100).forEach { it.delete() }
    }

    private fun rounded(src: Bitmap, radius: Float): Bitmap {
        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        Canvas(out).drawRoundRect(RectF(0f, 0f, src.width.toFloat(), src.height.toFloat()), radius, radius, paint)
        return out
    }
}
