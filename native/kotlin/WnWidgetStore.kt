package app.whatnext.addon

import android.content.Context
import org.json.JSONObject
import java.io.File

/** The data the home screen widgets show: one JSON snapshot that the app writes (WnWidgetPlugin.update) and the widgets read. */
object WnWidgetStore {
    private const val PREFS = "wn_widget"

    fun save(ctx: Context, json: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("snap", json).apply()
    }

    fun load(ctx: Context): JSONObject {
        val text = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("snap", null) ?: return JSONObject()
        return try {
            JSONObject(text)
        } catch (e: Exception) {
            JSONObject()
        }
    }

    // The last thing that went wrong, so the app can show it in its settings (a widget cannot show an error itself).
    fun note(ctx: Context, text: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("err", text + " (" + (System.currentTimeMillis() / 1000) + ")").apply()
    }

    fun lastNote(ctx: Context): String = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("err", "") ?: ""

    // After the tick button: this title is one episode further. When it is finished it leaves the Continue list.
    fun bump(ctx: Context, mediaId: Long, progress: Int, total: Int) {
        val snap = load(ctx)
        val old = snap.optJSONArray("continue") ?: return
        val next = org.json.JSONArray()
        for (i in 0 until old.length()) {
            val o = old.optJSONObject(i) ?: continue
            if (o.optLong("id", 0L) == mediaId) {
                if (total > 0 && progress >= total) continue
                o.put("p", progress)
            }
            next.put(o)
        }
        snap.put("continue", next)
        save(ctx, snap.toString())
    }

    // Signing out: nothing about the account stays in the widgets.
    fun clear(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
        File(ctx.cacheDir, "wn_widget").listFiles()?.forEach { it.delete() }
    }
}
