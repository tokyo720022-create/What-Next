package app.whatnext.addon

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/** "Today's pick": what Pick suggests right now, with its cover and the reason. Tapping opens the title. */
class WnPickWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        WnWidgetKit.run(this) { for (id in ids) manager.updateAppWidget(id, build(context)) }
    }

    private fun build(ctx: Context): RemoteViews {
        val k = WnWidgetKit
        val rv = RemoteViews(ctx.packageName, k.id(ctx, "layout", "wn_widget_pick"))
        val p = WnWidgetStore.load(ctx).optJSONObject("pick")
        rv.setTextViewText(k.id(ctx, "id", "pck_h"), "TODAY'S PICK")
        if (p == null || p.optLong("id", 0L) == 0L) {
            rv.setTextViewText(k.id(ctx, "id", "pck_t"), "Open the app")
            rv.setTextViewText(k.id(ctx, "id", "pck_s"), "Pick will choose something for you.")
            rv.setImageViewResource(k.id(ctx, "id", "pck_i"), k.id(ctx, "drawable", "wn_cover_placeholder"))
            rv.setOnClickPendingIntent(k.id(ctx, "id", "pck_root"), k.tap(ctx, "whatnext://pick"))
            return rv
        }
        rv.setTextViewText(k.id(ctx, "id", "pck_t"), k.str(p, "t"))
        rv.setTextViewText(k.id(ctx, "id", "pck_s"), k.str(p, "why"))
        val bmp = k.cover(ctx, k.str(p, "c"))
        if (bmp != null) rv.setImageViewBitmap(k.id(ctx, "id", "pck_i"), bmp) else rv.setImageViewResource(k.id(ctx, "id", "pck_i"), k.id(ctx, "drawable", "wn_cover_placeholder"))
        rv.setOnClickPendingIntent(k.id(ctx, "id", "pck_root"), k.tap(ctx, "whatnext://media/" + p.optLong("id", 0L)))
        return rv
    }
}
