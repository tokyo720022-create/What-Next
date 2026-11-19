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
import android.graphics.Color
import android.graphics.Rect
import android.graphics.Typeface
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

    // A widget does its work on a background thread while the system waits for it. Nothing that goes wrong in that thread may ever stop the app:
    // every error is caught, kept as a note (shown in App Settings) and the broadcast is always finished.
    fun run(receiver: BroadcastReceiver, work: () -> Unit) {
        val pending: BroadcastReceiver.PendingResult? = try { receiver.goAsync() } catch (e: Throwable) { null }
        val thread = Thread {
            try {
                work()
            } catch (e: Throwable) {
                // a widget that cannot draw keeps showing what it showed
            } finally {
                try { pending?.finish() } catch (e: Throwable) { }
            }
        }
        thread.setUncaughtExceptionHandler { _, _ -> }
        thread.start()
    }

    // The same for work that is not tied to a broadcast (downloading covers right after the app saved a snapshot).
    fun background(ctx: Context, work: () -> Unit) {
        val thread = Thread {
            try {
                work()
            } catch (e: Throwable) {
                WnWidgetStore.note(ctx, "background: " + e.javaClass.simpleName)
            }
        }
        thread.setUncaughtExceptionHandler { _, _ -> }
        thread.start()
    }

    fun widthDp(mgr: AppWidgetManager, id: Int): Int = mgr.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
    fun heightDp(mgr: AppWidgetManager, id: Int): Int = mgr.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)

    // Tell every widget on the home screen to draw again.
    fun refreshAll(ctx: Context) {
        try {
            val mgr = AppWidgetManager.getInstance(ctx)
            for (cls in PROVIDERS) {
                val ids = mgr.getAppWidgetIds(ComponentName(ctx, cls))
                if (ids.isEmpty()) continue
                val intent = Intent(ctx, cls)
                intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                ctx.sendBroadcast(intent)
            }
        } catch (e: Throwable) {
            WnWidgetStore.note(ctx, "refresh: " + e.javaClass.simpleName)
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

    // Covers: the app downloads them while it is open (prefetch), the widgets only read the small copies in the cache folder.
    // A widget update crosses a process boundary and Android refuses large pictures, so every cover is cut down to the size it is shown at.
    private fun coverFile(ctx: Context, url: String): File {
        val dir = File(ctx.cacheDir, "wn_widget")
        dir.mkdirs()
        return File(dir, Integer.toHexString(url.hashCode()) + ".jpg")
    }

    // Downloads one picture (the short side kept at about 200 pixels, saved as a JPEG). Returns true when it is in the cache.
    fun fetchCover(ctx: Context, url: String, timeoutMs: Int): Boolean {
        if (!url.startsWith("https://")) return false
        try {
            val file = coverFile(ctx, url)
            if (file.exists() && file.length() > 0) return true
            val bytes = download(url, timeoutMs) ?: return false
            val bounds = BitmapFactory.Options()
            bounds.inJustDecodeBounds = true
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            if (bounds.outWidth <= 0) {
                WnWidgetStore.note(ctx, "a cover could not be decoded")
                return false
            }
            var sample = 1
            while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 200) sample *= 2   // keep the short side at 200 pixels or more (a wide banner stays 200 tall)
            val opts = BitmapFactory.Options()
            opts.inSampleSize = sample
            val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return false
            FileOutputStream(file).use { decoded.compress(Bitmap.CompressFormat.JPEG, 85, it) }
            decoded.recycle()
            prune(file.parentFile)
            return true
        } catch (e: Exception) {
            WnWidgetStore.note(ctx, "cover: " + e.javaClass.simpleName)
            return false
        }
    }

    // Every cover address in a snapshot.
    fun coverUrls(snap: JSONObject): List<String> {
        val out = LinkedHashSet<String>()
        for (key in listOf("airing", "continue", "updates")) {
            val arr = snap.optJSONArray(key) ?: continue
            for (i in 0 until arr.length()) {
                val u = str(arr.optJSONObject(i), "c")
                val b = str(arr.optJSONObject(i), "b")
                if (u.isNotEmpty()) out.add(u)
                if (b.isNotEmpty()) out.add(b)
            }
        }
        val pick = str(snap.optJSONObject("pick"), "c")
        if (pick.isNotEmpty()) out.add(pick)
        return out.toList()
    }

    // The app calls this on a background thread after it saves a snapshot. Returns how many covers are new in the cache.
    fun prefetch(ctx: Context, snap: JSONObject): Int {
        val end = System.currentTimeMillis() + 25000
        var added = 0
        for (u in coverUrls(snap).take(40)) {
            if (System.currentTimeMillis() > end) break
            val had = coverFile(ctx, u).exists()
            if (fetchCover(ctx, u, 8000) && !had) added++
        }
        return added
    }

    // The saved picture for an address, downloaded now if there is still time (until).
    private fun plain(ctx: Context, url: String, until: Long): Bitmap? {
        if (!url.startsWith("https://")) return null
        val file = coverFile(ctx, url)
        if (!file.exists() && System.currentTimeMillis() < until - 1500) fetchCover(ctx, url, 4000)
        if (!file.exists()) return null
        return BitmapFactory.decodeFile(file.path)
    }

    // The Continue tile, like Trakt's: a wide picture (the title's banner, else its cover cut to a wide shape) with the episode length and
    // "N left" as chips on it, a thin progress line along the bottom, and rounded corners. Drawn here so the widget only has to show one picture.
    fun tile(ctx: Context, bannerUrl: String, coverUrl: String, minutes: Int, left: Int, fraction: Float, until: Long): Bitmap? {
        try {
            val src = plain(ctx, bannerUrl, until) ?: plain(ctx, coverUrl, until) ?: return null
            val w = 270
            val h = 152
            val wide = 16f / 9f
            val cw: Int
            val ch: Int
            if (src.width.toFloat() / src.height > wide) {
                ch = src.height
                cw = (src.height * wide).toInt()
            } else {
                cw = src.width
                ch = (src.width / wide).toInt()
            }
            val cx = (src.width - cw) / 2
            val cy = ((src.height - ch) * 0.3f).toInt()   // from a tall cover, the upper part (faces) rather than the exact middle
            val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(out)
            canvas.drawBitmap(src, Rect(cx, cy, cx + cw, cy + ch), Rect(0, 0, w, h), Paint(Paint.FILTER_BITMAP_FLAG))
            val shade = Paint(Paint.ANTI_ALIAS_FLAG)
            shade.color = 0xB3000000.toInt()
            val ink = Paint(Paint.ANTI_ALIAS_FLAG)
            ink.color = Color.WHITE
            ink.textSize = 18f
            ink.typeface = Typeface.DEFAULT_BOLD
            val top = h - 14f - 28f
            if (minutes > 0) chip(canvas, "" + minutes + "m", 10f, top, shade, ink)
            if (left > 0) {
                val text = "" + left + " left"
                chip(canvas, text, w - 10f - (ink.measureText(text) + 20f), top, shade, ink)
            }
            if (fraction > 0f) {
                val track = Paint()
                track.color = 0x66FFFFFF
                canvas.drawRect(0f, h - 5f, w.toFloat(), h.toFloat(), track)
                val fill = Paint()
                fill.color = 0xFF8B7CFF.toInt()
                canvas.drawRect(0f, h - 5f, w * minOf(1f, fraction), h.toFloat(), fill)
            }
            return rounded(out, 16f)
        } catch (e: Exception) {
            return null
        }
    }

    private fun chip(canvas: Canvas, text: String, x: Float, y: Float, shade: Paint, ink: Paint) {
        val width = ink.measureText(text) + 20f
        canvas.drawRoundRect(RectF(x, y, x + width, y + 28f), 14f, 14f, shade)
        canvas.drawText(text, x + 10f, y + 20f, ink)
    }

    // A cover as a small bitmap with rounded corners, at most maxW x maxH pixels. Only the cache is read unless there is still time (until) to download it.
    fun cover(ctx: Context, url: String, maxW: Int, maxH: Int, until: Long): Bitmap? {
        if (!url.startsWith("https://")) return null
        try {
            val file = coverFile(ctx, url)
            if (!file.exists() && System.currentTimeMillis() < until - 1500) fetchCover(ctx, url, 4000)
            if (!file.exists()) return null
            val plain = BitmapFactory.decodeFile(file.path) ?: return null
            val scale = minOf(1f, minOf(maxW.toFloat() / plain.width, maxH.toFloat() / plain.height))
            val small = if (scale < 1f) Bitmap.createScaledBitmap(plain, maxOf(1, (plain.width * scale).toInt()), maxOf(1, (plain.height * scale).toInt()), true) else plain
            return rounded(small, minOf(small.width, small.height) * 0.1f)
        } catch (e: Exception) {
            return null
        }
    }

    private fun download(url: String, timeoutMs: Int): ByteArray? {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", "WhatNext-Widget/1.0 (Android)")
            conn.setRequestProperty("Accept", "image/*")
            if (conn.responseCode != 200) return null
            return conn.inputStream.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }
    }

    // Keeps the cache small: the oldest covers go first.
    private fun prune(dir: File?) {
        val files = dir?.listFiles() ?: return
        if (files.size <= 120) return
        files.sortedBy { it.lastModified() }.take(files.size - 100).forEach { it.delete() }
    }

    // Draws a widget with its covers; if Android refuses the update (too much picture data, for example), it is drawn again without them
    // and the reason is kept so the app can show it.
    fun safeUpdate(ctx: Context, mgr: AppWidgetManager, id: Int, build: (Boolean) -> android.widget.RemoteViews) {
        try {
            mgr.updateAppWidget(id, build(true))
        } catch (e: Exception) {
            WnWidgetStore.note(ctx, "update: " + e.javaClass.simpleName + " " + (e.message ?: "").take(80))
            mgr.updateAppWidget(id, build(false))
        }
    }

    fun toast(ctx: Context, text: String) {
        android.os.Handler(android.os.Looper.getMainLooper()).post { android.widget.Toast.makeText(ctx, text, android.widget.Toast.LENGTH_SHORT).show() }
    }

    private fun rounded(src: Bitmap, radius: Float): Bitmap {
        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        Canvas(out).drawRoundRect(RectF(0f, 0f, src.width.toFloat(), src.height.toFloat()), radius, radius, paint)
        return out
    }
}
