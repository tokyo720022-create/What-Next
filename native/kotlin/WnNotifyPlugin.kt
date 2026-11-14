package app.whatnext.addon

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.TimeUnit

/**
 * Turns the background check for new AniList notifications on or off (see WnPollWorker).
 * The app calls configure({ enabled, types }) at start, when a switch changes and when the person logs out.
 * Every method can fail; the app then simply has no background alerts, and release reminders (which do not use this) keep working.
 */
@CapacitorPlugin(name = "WnNotify")
class WnNotifyPlugin : Plugin() {
    @PluginMethod
    fun configure(call: PluginCall) {
        try {
            val on = call.getBoolean("enabled", false) ?: false
            // Only capital letters, underscores and commas: the list ends up inside a GraphQL query.
            val types = (call.getString("types") ?: "").filter { it.isUpperCase() || it == '_' || it == ',' }.take(600)
            val prefs = context.getSharedPreferences(WnPollWorker.PREFS, Context.MODE_PRIVATE)
            val work = WorkManager.getInstance(context)
            if (on && types.isNotEmpty()) {
                val edit = prefs.edit().putBoolean("on", true).putString("types", types)
                // Starting now: only notifications that arrive from here on are shown, never the old ones.
                if (!prefs.contains("last")) edit.putLong("last", System.currentTimeMillis() / 1000)
                edit.apply()
                val request = PeriodicWorkRequest.Builder(WnPollWorker::class.java, 30, TimeUnit.MINUTES)
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build()
                work.enqueueUniquePeriodicWork(WnPollWorker.WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
            } else {
                prefs.edit().putBoolean("on", false).remove("last").apply()
                work.cancelUniqueWork(WnPollWorker.WORK)
            }
            call.resolve()
        } catch (e: Exception) {
            call.reject("notify setup failed")
        }
    }
}
