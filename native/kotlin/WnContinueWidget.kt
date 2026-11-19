package app.whatnext.addon

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * "Continue": what you are watching or reading, two tiles across and two down when there is room.
 * Each tile has a wide picture with the episode length and how many are left as chips on it, the title, which episode or chapter is next and a tick button
 * that marks the next one as done on AniList without opening the app.
 */
class WnContinueWidget : AppWidgetProvider() {

    companion object {
        const val ACTION_PLUS = "app.whatnext.widget.PLUS"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == ACTION_PLUS) {
            plus(context, intent)
            return
        }
        super.onReceive(context, intent)
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        WnWidgetKit.run(this) {
            val until = System.currentTimeMillis() + 8000
            for (id in ids) WnWidgetKit.safeUpdate(context, manager, id) { covers -> build(context, manager, id, covers, until) }
        }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle) {
        onUpdate(context, manager, intArrayOf(id))
    }

    // The tick button: one more episode or chapter on AniList, then the widget shows it.
    private fun plus(ctx: Context, intent: Intent) {
        val mediaId = intent.getLongExtra("id", 0L)
        val progress = intent.getIntExtra("p", 0) + 1
        val total = intent.getIntExtra("total", 0)
        if (mediaId <= 0L) return
        WnWidgetKit.run(this) {
            if (WnApi.setProgress(ctx, mediaId, progress, total)) {
                WnWidgetStore.bump(ctx, mediaId, progress, total)
                WnWidgetKit.refreshAll(ctx)
                WnWidgetKit.toast(ctx, if (total > 0 && progress >= total) "Finished. Marked as completed." else "Marked as done.")
            } else {
                WnWidgetKit.toast(ctx, "Couldn't update. Open What Next and try again.")
            }
        }
    }

    private fun plusIntent(ctx: Context, o: JSONObject): PendingIntent {
        val id = o.optLong("id", 0L)
        val intent = Intent(ctx, WnContinueWidget::class.java)
        intent.action = ACTION_PLUS
        intent.data = Uri.parse("whatnext://plus/$id")   // makes each title's button its own PendingIntent
        intent.putExtra("id", id)
        intent.putExtra("p", o.optInt("p", 0))
        intent.putExtra("total", o.optInt("total", 0))
        return PendingIntent.getBroadcast(ctx, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun build(ctx: Context, mgr: AppWidgetManager, widgetId: Int, covers: Boolean, until: Long): RemoteViews {
        val k = WnWidgetKit
        val rv = RemoteViews(ctx.packageName, k.id(ctx, "layout", "wn_widget_continue"))
        val cols = if (k.widthDp(mgr, widgetId) >= 250) 2 else 1
        val rows = if (k.heightDp(mgr, widgetId) >= 200) 2 else 1
        val list = WnWidgetStore.load(ctx).optJSONArray("continue")
        val have = list?.length() ?: 0
        rv.setTextViewText(k.id(ctx, "id", "con_head"), "Continue Watching")
        rv.setTextViewText(k.id(ctx, "id", "con_empty"), "Nothing in progress. Start something from Pick.")
        rv.setViewVisibility(k.id(ctx, "id", "con_empty"), if (have == 0) View.VISIBLE else View.GONE)
        var next = 0
        for (row in 1..2) {
            var any = false
            for (col in 1..2) {
                val n = (row - 1) * 2 + col
                val tile = k.id(ctx, "id", "con_c$n")
                val o: JSONObject? = if (row <= rows && col <= cols && next < have) list?.optJSONObject(next++) else null
                if (o == null) {
                    rv.setViewVisibility(tile, View.GONE)
                    continue
                }
                any = true
                val manga = k.str(o, "ty") == "MANGA"
                val total = o.optInt("total", 0)
                val progress = o.optInt("p", 0)
                val duration = o.optInt("du", 0)
                rv.setViewVisibility(tile, View.VISIBLE)
                rv.setTextViewText(k.id(ctx, "id", "con_t$n"), k.str(o, "t"))
                rv.setTextViewText(k.id(ctx, "id", "con_s$n"), (if (manga) "Chapter " else "Episode ") + (progress + 1))
                val img = k.id(ctx, "id", "con_i$n")
                val left = if (total > progress) total - progress else 0
                val bmp = if (covers) k.tile(ctx, k.str(o, "b"), k.str(o, "c"), duration, left, if (total > 0) progress.toFloat() / total else 0f, until) else null
                if (bmp != null) rv.setImageViewBitmap(img, bmp) else rv.setImageViewResource(img, k.id(ctx, "drawable", "wn_tile_placeholder"))
                val open = k.tap(ctx, "whatnext://media/" + o.optLong("id", 0L))
                rv.setOnClickPendingIntent(img, open)
                rv.setOnClickPendingIntent(k.id(ctx, "id", "con_b$n"), open)
                rv.setOnClickPendingIntent(k.id(ctx, "id", "con_k$n"), plusIntent(ctx, o))
                rv.setContentDescription(k.id(ctx, "id", "con_k$n"), "Mark the next " + (if (manga) "chapter" else "episode") + " as done")
            }
            rv.setViewVisibility(k.id(ctx, "id", "con_r$row"), if (any) View.VISIBLE else View.GONE)
        }
        rv.setOnClickPendingIntent(k.id(ctx, "id", "con_head"), k.tap(ctx, "whatnext://pick"))
        rv.setOnClickPendingIntent(k.id(ctx, "id", "con_hi"), k.tap(ctx, "whatnext://pick"))
        return rv
    }
}
