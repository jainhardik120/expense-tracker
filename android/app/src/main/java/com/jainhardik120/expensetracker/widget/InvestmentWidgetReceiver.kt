package com.jainhardik120.expensetracker.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class InvestmentWidgetReceiver : GlanceAppWidgetReceiver() {

    override val glanceAppWidget: GlanceAppWidget = InvestmentWidget()

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        // Placed, restored after a reboot, or resized: make sure the timer
        // exists and put something current on screen.
        InvestmentWidgetRefreshScheduler.ensureScheduled(context)
        InvestmentWidgetRefreshScheduler.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        InvestmentWidgetRefreshScheduler.ensureScheduled(context)
        InvestmentWidgetRefreshScheduler.refreshNow(context)
    }
}
