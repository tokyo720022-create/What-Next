package app.whatnext.addon

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/** "Today's pick": what Pick suggests right now, with its cover and the reason. Tapping opens the title. */
class WnPickWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        WnWidgetKit.run(this) {
            val until = System.currentTimeMillis() + 8000
            for (id in ids) WnWidgetKit.safeUpdate(context, manager, id) { covers -> build(context, covers, until) }
        }
    }

    private fun build(ctx: Context, covers: Boolean, until: Long): RemoteViews {
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
        val bmp = if (covers) k.cover(ctx, k.str(p, "c"), 190, 275, until) else null
        if (bmp != null) rv.setImageViewBitmap(k.id(ctx, "id", "pck_i"), bmp) else rv.setImageViewResource(k.id(ctx, "id", "pck_i"), k.id(ctx, "drawable", "wn_cover_placeholder"))
        rv.setOnClickPendingIntent(k.id(ctx, "id", "pck_root"), k.tap(ctx, "whatnext://media/" + p.optLong("id", 0L)))
        return rv
    }
}
