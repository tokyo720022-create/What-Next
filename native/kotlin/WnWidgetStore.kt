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

    // Signing out: nothing about the account stays in the widgets.
    fun clear(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
        File(ctx.cacheDir, "wn_widget").listFiles()?.forEach { it.delete() }
    }
}
