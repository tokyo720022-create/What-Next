package app.whatnext.addon

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * The bridge between the app and its home screen widgets.
 * update({ json }) stores the newest snapshot and redraws every widget on the home screen; pin({ kind }) asks Android to add one;
 * status() says which kinds are on the home screen; clear() removes everything (signing out).
 * Every method can fail; the app then simply has no widgets.
 */
@CapacitorPlugin(name = "WnWidget")
class WnWidgetPlugin : Plugin() {
    private val kinds: Map<String, Class<*>> = mapOf("airing" to WnAiringWidget::class.java, "continue" to WnContinueWidget::class.java, "updates" to WnUpdatesWidget::class.java, "streak" to WnStreakWidget::class.java, "pick" to WnPickWidget::class.java)

    @PluginMethod
    fun update(call: PluginCall) {
        try {
            val json = call.getString("json")
            if (json == null || json.length > 400000) {
                call.reject("bad snapshot")
                return
            }
            WnWidgetStore.save(context, json)
            WnWidgetKit.refreshAll(context)
            call.resolve()
        } catch (e: Exception) {
            call.reject("widget update failed")
        }
    }

    @PluginMethod
    fun pin(call: PluginCall) {
        val result = JSObject()
        try {
            val cls = kinds[call.getString("kind") ?: ""]
            val mgr = AppWidgetManager.getInstance(context)
            val supported = cls != null && Build.VERSION.SDK_INT >= 26 && mgr.isRequestPinAppWidgetSupported
            result.put("supported", supported)
            result.put("ok", supported && mgr.requestPinAppWidget(ComponentName(context, cls!!), null, null))
            call.resolve(result)
        } catch (e: Exception) {
            result.put("supported", false)
            result.put("ok", false)
            call.resolve(result)
        }
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val result = JSObject()
        try {
            val mgr = AppWidgetManager.getInstance(context)
            for ((name, cls) in kinds) result.put(name, mgr.getAppWidgetIds(ComponentName(context, cls)).size)
        } catch (e: Exception) {
            // an empty answer means "unknown"
        }
        call.resolve(result)
    }

    @PluginMethod
    fun clear(call: PluginCall) {
        try {
            WnWidgetStore.clear(context)
            WnWidgetKit.refreshAll(context)
            call.resolve()
        } catch (e: Exception) {
            call.reject("clear failed")
        }
    }
}
