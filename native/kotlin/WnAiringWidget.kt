package app.whatnext.addon

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/** "Airing soon": the next episodes of the anime on your list. As many rows are shown as the widget is tall. */
class WnAiringWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        WnWidgetKit.run(this) { for (id in ids) manager.updateAppWidget(id, build(context, manager, id)) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle) {
        onUpdate(context, manager, intArrayOf(id))
    }

    private fun build(ctx: Context, mgr: AppWidgetManager, widgetId: Int): RemoteViews {
        val k = WnWidgetKit
        val rv = RemoteViews(ctx.packageName, k.id(ctx, "layout", "wn_widget_airing"))
        val rows = ((k.heightDp(mgr, widgetId) - 44) / 48).coerceIn(1, 4)
        val now = System.currentTimeMillis() / 1000
        val list = WnWidgetStore.load(ctx).optJSONArray("airing")
        val shown = ArrayList<JSONObject>()
        if (list != null) {
            for (i in 0 until list.length()) {
                val o = list.optJSONObject(i) ?: continue
                if (o.optLong("at", 0L) >= now - 900) shown.add(o)   // an episode stays for 15 minutes after it airs
            }
        }
        rv.setTextViewText(k.id(ctx, "id", "air_head"), "Airing soon")
        rv.setViewVisibility(k.id(ctx, "id", "air_empty"), if (shown.isEmpty()) View.VISIBLE else View.GONE)
        rv.setTextViewText(k.id(ctx, "id", "air_empty"), "Nothing from your list airs soon.")
        for (n in 1..4) {
            val row = k.id(ctx, "id", "air_r$n")
            if (n > rows || n > shown.size) {
                rv.setViewVisibility(row, View.GONE)
                continue
            }
            val o = shown[n - 1]
            rv.setViewVisibility(row, View.VISIBLE)
            rv.setTextViewText(k.id(ctx, "id", "air_t$n"), k.str(o, "t"))
            rv.setTextViewText(k.id(ctx, "id", "air_s$n"), "Ep " + o.optInt("ep", 0) + " · " + k.rel(o.optLong("at", 0L), now))
            val img = k.id(ctx, "id", "air_i$n")
            val bmp = k.cover(ctx, k.str(o, "c"))
            if (bmp != null) rv.setImageViewBitmap(img, bmp) else rv.setImageViewResource(img, k.id(ctx, "drawable", "wn_cover_placeholder"))
            rv.setOnClickPendingIntent(row, k.tap(ctx, "whatnext://media/" + o.optLong("id", 0L)))
        }
        rv.setOnClickPendingIntent(k.id(ctx, "id", "air_head"), k.tap(ctx, "whatnext://schedule"))
        rv.setOnClickPendingIntent(k.id(ctx, "id", "air_empty"), k.tap(ctx, "whatnext://schedule"))
        return rv
    }
}
