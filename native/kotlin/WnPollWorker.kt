package app.whatnext.addon

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Runs about every 30 minutes (WorkManager decides the exact time) while background alerts are on. It asks AniList for the newest
 * notifications of the chosen types and shows a phone notification for each one that is newer than the last one seen.
 * It reads the login from the same encrypted store as WnSecurePlugin and only talks to graphql.anilist.co. It never marks anything read
 * on AniList, so the unread count in the app stays right. Any problem ends the run quietly; the next run tries again.
 */
class WnPollWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        try {
            poll()
        } catch (e: Exception) {
            // nothing to do: the next run tries again
        }
        return Result.success()
    }

    private fun token(): String? {
        val master = MasterKey.Builder(applicationContext).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        val prefs = EncryptedSharedPreferences.create(
            applicationContext,
            "wn_secure",
            master,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
        return prefs.getString("wn_token", null)
    }

    private fun query(types: String): String {
        val who = "user{name}"
        val title = "media{title{romaji english}}"
        return "query{Page(page:1,perPage:20){notifications(type_in:[$types]){__typename " +
            "... on RelatedMediaAdditionNotification{id createdAt context $title} " +
            "... on MediaDataChangeNotification{id createdAt context reason $title} " +
            "... on MediaMergeNotification{id createdAt context reason $title} " +
            "... on MediaDeletionNotification{id createdAt context deletedMediaTitle} " +
            "... on FollowingNotification{id createdAt context $who} " +
            "... on ActivityMessageNotification{id createdAt context $who} " +
            "... on ActivityReplyNotification{id createdAt context $who} " +
            "... on ActivityMentionNotification{id createdAt context $who} " +
            "... on ActivityLikeNotification{id createdAt context $who} " +
            "... on ActivityReplyLikeNotification{id createdAt context $who} " +
            "... on ActivityReplySubscribedNotification{id createdAt context $who} " +
            "... on ThreadCommentMentionNotification{id createdAt context $who} " +
            "... on ThreadCommentReplyNotification{id createdAt context $who} " +
            "... on ThreadCommentSubscribedNotification{id createdAt context $who} " +
            "... on ThreadCommentLikeNotification{id createdAt context $who} " +
            "... on ThreadLikeNotification{id createdAt context $who}" +
            "}}}"
    }

    private fun fetch(token: String, types: String): String? {
        val conn = URL("https://graphql.anilist.co").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15000
            conn.readTimeout = 20000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $token")
            val body = JSONObject().put("query", query(types)).toString()
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            if (conn.responseCode != 200) return null
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    // AniList sends null for a missing value, and optString would turn that into the word "null".
    private fun str(o: JSONObject?, key: String): String {
        if (o == null || o.isNull(key)) return ""
        return o.optString(key, "").trim()
    }

    private fun words(o: JSONObject): Pair<String, String> {
        val context = str(o, "context")
        val media = o.optJSONObject("media")
        val user = o.optJSONObject("user")
        val name = when {
            media != null -> {
                val t = media.optJSONObject("title")
                val en = str(t, "english")
                if (en.isNotEmpty()) en else str(t, "romaji")
            }
            user != null -> str(user, "name").ifEmpty { "Someone" }
            o.has("deletedMediaTitle") -> str(o, "deletedMediaTitle").ifEmpty { "A title" }
            else -> "AniList"
        }
        val tail = if (context.isNotEmpty()) context else "has an update."
        return Pair("$name $tail".replace(Regex("\\s+"), " ").trim(), str(o, "reason"))
    }

    private fun poll() {
        val cfg = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!cfg.getBoolean("on", false)) return
        val types = cfg.getString("types", "") ?: ""
        if (types.isEmpty()) return
        val token = token() ?: return
        val raw = fetch(token, types) ?: return
        val list = JSONObject(raw).optJSONObject("data")?.optJSONObject("Page")?.optJSONArray("notifications") ?: return
        val last = cfg.getLong("last", System.currentTimeMillis() / 1000)
        var newest = last
        val fresh = ArrayList<JSONObject>()
        for (i in 0 until list.length()) {
            val o = list.optJSONObject(i) ?: continue
            val at = o.optLong("createdAt", 0L)
            if (at > newest) newest = at
            if (at > last) fresh.add(o)
        }
        if (fresh.isEmpty()) return
        cfg.edit().putLong("last", newest).apply()   // remembered first, so a crash while showing never shows the same ones twice
        fresh.sortBy { it.optLong("createdAt", 0L) }
        show(fresh)
    }

    @SuppressLint("MissingPermission")
    private fun show(fresh: List<JSONObject>) {
        val ctx = applicationContext
        val nm = NotificationManagerCompat.from(ctx)
        if (!nm.areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(CHANNEL, "AniList updates", NotificationManager.IMPORTANCE_DEFAULT)
            channel.description = "Sequels added and changes to titles on your list"
            (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
        val open = Intent(Intent.ACTION_VIEW, Uri.parse("whatnext://notifications"))
        open.setPackage(ctx.packageName)
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val tap = PendingIntent.getActivity(ctx, 7, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        var icon = ctx.resources.getIdentifier("ic_stat_whatnext", "drawable", ctx.packageName)
        if (icon == 0) icon = ctx.applicationInfo.icon
        fun post(id: Int, title: String, text: String) {
            val n = NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(icon)
                .setColor(0xFF8B7CFF.toInt())
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build()
            nm.notify(id, n)
        }
        if (fresh.size > 3) {
            post(SUMMARY_ID, "AniList: " + fresh.size + " new updates", "Tap to open your notifications.")
            return
        }
        for (o in fresh) {
            val (text, reason) = words(o)
            post(("n" + o.optLong("id", 0L)).hashCode(), "AniList update", if (reason.isNotEmpty()) "$text\n$reason" else text)
        }
    }

    companion object {
        const val PREFS = "wn_notify"
        const val WORK = "wn_poll"
        private const val CHANNEL = "wn_updates"
        private const val SUMMARY_ID = 7001
    }
}
