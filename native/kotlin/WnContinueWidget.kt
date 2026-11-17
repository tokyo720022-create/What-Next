package app.whatnext.addon

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/** "Continue": what you are watching or reading, with covers and progress. As many tiles are shown as the widget is wide. */
class WnContinueWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        WnWidgetKit.run(this) { for (id in ids) manager.updateAppWidget(id, build(context, manager, id)) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle) {
        onUpdate(context, manager, intArrayOf(id))
    }

    private fun build(ctx: Context, mgr: AppWidgetManager, widgetId: Int): RemoteViews {
        val k = WnWidgetKit
        val rv = RemoteViews(ctx.packageName, k.id(ctx, "layout", "wn_widget_continue"))
        val tiles = ((k.widthDp(mgr, widgetId) - 24) / 76).coerceIn(2, 4)
        val list = WnWidgetStore.load(ctx).optJSONArray("continue")
        val count = if (list == null) 0 else minOf(list.length(), tiles)
        rv.setTextViewText(k.id(ctx, "id", "con_head"), "Continue")
        rv.setTextViewText(k.id(ctx, "id", "con_empty"), "Nothing in progress. Start something from Pick.")
        rv.setViewVisibility(k.id(ctx, "id", "con_empty"), if (count == 0) View.VISIBLE else View.GONE)
        rv.setViewVisibility(k.id(ctx, "id", "con_row"), if (count == 0) View.GONE else View.VISIBLE)
        for (n in 1..4) {
            val tile = k.id(ctx, "id", "con_c$n")
            if (n > count) {
                rv.setViewVisibility(tile, View.GONE)
                continue
            }
            val o: JSONObject = list!!.optJSONObject(n - 1) ?: continue
            val manga = k.str(o, "ty") == "MANGA"
            val total = o.optInt("total", 0)
            val progress = o.optInt("p", 0)
            rv.setViewVisibility(tile, View.VISIBLE)
            rv.setTextViewText(k.id(ctx, "id", "con_t$n"), k.str(o, "t"))
            rv.setTextViewText(k.id(ctx, "id", "con_s$n"), (if (manga) "Ch " else "Ep ") + progress + (if (total > 0) "/$total" else ""))
            rv.setProgressBar(k.id(ctx, "id", "con_p$n"), if (total > 0) total else 100, if (total > 0) minOf(progress, total) else 0, false)
            val img = k.id(ctx, "id", "con_i$n")
            val bmp = k.cover(ctx, k.str(o, "c"))
            if (bmp != null) rv.setImageViewBitmap(img, bmp) else rv.setImageViewResource(img, k.id(ctx, "drawable", "wn_cover_placeholder"))
            rv.setOnClickPendingIntent(tile, k.tap(ctx, "whatnext://media/" + o.optLong("id", 0L)))
        }
        rv.setOnClickPendingIntent(k.id(ctx, "id", "con_head"), k.tap(ctx, "whatnext://pick"))
        return rv
    }
}
