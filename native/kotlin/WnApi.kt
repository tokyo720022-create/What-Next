package app.whatnext.addon

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Marks progress on AniList for the widget's tick button, with the login that the app keeps in the encrypted store (the same one WnSecurePlugin and WnPollWorker read). */
object WnApi {
    private fun token(ctx: Context): String? {
        val master = MasterKey.Builder(ctx).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        val prefs = EncryptedSharedPreferences.create(
            ctx,
            "wn_secure",
            master,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
        return prefs.getString("wn_token", null)
    }

    // Sets the progress of one title. A title that reaches its last episode or chapter is marked Completed. Returns true when AniList accepted it.
    fun setProgress(ctx: Context, mediaId: Long, progress: Int, total: Int): Boolean {
        try {
            val token = token(ctx) ?: return false
            val done = total > 0 && progress >= total
            val query = "mutation(\$id:Int,\$p:Int){SaveMediaListEntry(mediaId:\$id,progress:\$p" + (if (done) ",status:COMPLETED" else "") + "){id}}"
            val body = JSONObject().put("query", query).put("variables", JSONObject().put("id", mediaId).put("p", progress)).toString()
            val conn = URL("https://graphql.anilist.co").openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "POST"
                conn.connectTimeout = 10000
                conn.readTimeout = 15000
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Accept", "application/json")
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                if (conn.responseCode != 200) {
                    WnWidgetStore.note(ctx, "AniList answered " + conn.responseCode)
                    return false
                }
                val text = conn.inputStream.bufferedReader().use { it.readText() }
                return !JSONObject(text).has("errors")
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            WnWidgetStore.note(ctx, "tick: " + e.javaClass.simpleName)
            return false
        }
    }
}
