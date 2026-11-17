package app.whatnext.addon

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews

/** "Updates": the covers of the titles you changed most recently, in a grid of up to two rows of four. */
class WnUpdatesWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        WnWidgetKit.run(this) { for (id in ids) manager.updateAppWidget(id, build(context, manager, id)) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle) {
        onUpdate(context, manager, intArrayOf(id))
    }

    private fun build(ctx: Context, mgr: AppWidgetManager, widgetId: Int): RemoteViews {
        val k = WnWidgetKit
        val rv = RemoteViews(ctx.packageName, k.id(ctx, "layout", "wn_widget_updates"))
        val rowsWanted = if (k.heightDp(mgr, widgetId) >= 130) 2 else 1
        val list = WnWidgetStore.load(ctx).optJSONArray("updates")
        val total = if (list == null) 0 else minOf(list.length(), rowsWanted * 4)
        rv.setTextViewText(k.id(ctx, "id", "upd_empty"), "Update a title and its cover shows here.")
        rv.setViewVisibility(k.id(ctx, "id", "upd_empty"), if (total == 0) View.VISIBLE else View.GONE)
        rv.setViewVisibility(k.id(ctx, "id", "upd_r1"), if (total == 0) View.GONE else View.VISIBLE)
        rv.setViewVisibility(k.id(ctx, "id", "upd_r2"), if (total > 4) View.VISIBLE else View.GONE)
        for (n in 1..8) {
            val img = k.id(ctx, "id", "upd_i$n")
            if (n > total) {
                rv.setViewVisibility(img, View.INVISIBLE)
                continue
            }
            val o = list!!.optJSONObject(n - 1) ?: continue
            rv.setViewVisibility(img, View.VISIBLE)
            val bmp = k.cover(ctx, k.str(o, "c"))
            if (bmp != null) rv.setImageViewBitmap(img, bmp) else rv.setImageViewResource(img, k.id(ctx, "drawable", "wn_cover_placeholder"))
            rv.setOnClickPendingIntent(img, k.tap(ctx, "whatnext://media/" + o.optLong("id", 0L)))
        }
        rv.setOnClickPendingIntent(k.id(ctx, "id", "upd_empty"), k.tap(ctx, "whatnext://pick"))
        return rv
    }
}
