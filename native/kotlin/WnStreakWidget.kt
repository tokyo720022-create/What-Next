package app.whatnext.addon

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/** "Daily streak": how many days in a row you updated your list, and the last seven days as dots. */
class WnStreakWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        WnWidgetKit.run(this) { for (id in ids) manager.updateAppWidget(id, build(context)) }
    }

    private fun build(ctx: Context): RemoteViews {
        val k = WnWidgetKit
        val rv = RemoteViews(ctx.packageName, k.id(ctx, "layout", "wn_widget_streak"))
        val s = WnWidgetStore.load(ctx).optJSONObject("streak")
        val days = s?.optInt("days", 0) ?: 0
        val risk = s?.optBoolean("risk", false) ?: false
        rv.setTextViewText(k.id(ctx, "id", "stk_t"), if (days == 1) "1-day streak" else "$days-day streak")
        rv.setTextViewText(k.id(ctx, "id", "stk_s"), if (days == 0) "Update a title today to start one." else if (risk) "Update a title today to keep it." else "Nice work, see you tomorrow.")
        val week = s?.optJSONArray("week")
        val on = k.id(ctx, "drawable", "wn_dot_on")
        val off = k.id(ctx, "drawable", "wn_dot_off")
        for (n in 1..7) {
            val lit = week != null && week.optInt(n - 1, 0) == 1
            rv.setImageViewResource(k.id(ctx, "id", "stk_d$n"), if (lit) on else off)
        }
        rv.setOnClickPendingIntent(k.id(ctx, "id", "stk_root"), k.tap(ctx, "whatnext://pick"))
        return rv
    }
}
