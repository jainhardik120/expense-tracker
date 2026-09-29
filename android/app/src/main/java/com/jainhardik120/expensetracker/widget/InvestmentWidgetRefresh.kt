package com.jainhardik120.expensetracker.widget

import android.content.Context
import android.util.Log
import androidx.datastore.preferences.core.MutablePreferences
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.appwidget.updateAll
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.jainhardik120.expensetracker.data.entity.Result as ApiResult
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit

/**
 * Fetches the portfolio and hands it to Glance.
 *
 * Every call to the server prices the whole portfolio against live market data,
 * so this runs on its own, slower timer than the balance widget rather than
 * sharing that one's quarter-hour.
 */
@HiltWorker
class InvestmentWidgetRefreshWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val api: ExpenseTrackerAPI
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return when (val result = api.getInvestments()) {
            is ApiResult.Success -> {
                val overview = result.data ?: return Result.retry()
                val summary = overview.summary
                updateEveryInvestmentWidget(applicationContext) { prefs ->
                    prefs[InvestmentWidgetKeys.valuation] = summary.valuation
                    prefs[InvestmentWidgetKeys.invested] = summary.invested
                    prefs[InvestmentWidgetKeys.pnl] = summary.pnl
                    prefs[InvestmentWidgetKeys.dayChange] = summary.dayChange
                    prefs[InvestmentWidgetKeys.pnlPercentage] = summary.pnlPercentage ?: 0.0
                    prefs[InvestmentWidgetKeys.hasPnlPercentage] =
                        if (summary.pnlPercentage == null) 0 else 1
                    prefs[InvestmentWidgetKeys.dayChangePercentage] =
                        summary.dayChangePercentage ?: 0.0
                    prefs[InvestmentWidgetKeys.hasDayChangePercentage] =
                        if (summary.dayChangePercentage == null) 0 else 1
                    prefs[InvestmentWidgetKeys.updatedAt] = System.currentTimeMillis()
                    prefs.remove(InvestmentWidgetKeys.error)
                }
                Result.success()
            }

            // Keep whatever is on screen; say when it was last true and move on.
            is ApiResult.ClientException -> {
                Log.e(TAG, "Investment widget refused: ${result.statusCode}")
                updateEveryInvestmentWidget(applicationContext) {
                    it[InvestmentWidgetKeys.error] = "sign in needed"
                }
                Result.failure()
            }

            is ApiResult.Exception -> {
                Log.w(TAG, "Investment widget failed: ${result.errorMessage}")
                updateEveryInvestmentWidget(applicationContext) {
                    it[InvestmentWidgetKeys.error] = "offline"
                }
                Result.retry()
            }
        }
    }

    private companion object {
        const val TAG = "InvestmentWidgetWorker"
    }
}

private suspend fun updateEveryInvestmentWidget(
    context: Context,
    edit: (MutablePreferences) -> Unit
) {
    val manager = GlanceAppWidgetManager(context)
    val widget = InvestmentWidget()
    val ids: List<GlanceId> = manager.getGlanceIds(InvestmentWidget::class.java)
    for (id in ids) {
        updateAppWidgetState(context, id) { prefs -> edit(prefs) }
    }
    widget.updateAll(context)
}

/** Tapping the widget asks for fresh numbers. */
class RefreshInvestmentWidgetAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: androidx.glance.action.ActionParameters
    ) {
        InvestmentWidgetRefreshScheduler.refreshNow(context)
    }
}

object InvestmentWidgetRefreshScheduler {
    private const val UNIQUE_PERIODIC = "investment-widget-refresh-periodic"
    private const val UNIQUE_ONCE = "investment-widget-refresh-now"
    /**
     * Half an hour. Pricing the portfolio is a round of calls to the market
     * data providers, and none of these numbers move fast enough to be worth
     * four of those an hour.
     */
    private const val REFRESH_MINUTES = 30L
    private const val BACKOFF_SECONDS = 30L

    private val onlyWhenOnline = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun ensureScheduled(context: Context) {
        val periodic = PeriodicWorkRequestBuilder<InvestmentWidgetRefreshWorker>(
            REFRESH_MINUTES, TimeUnit.MINUTES
        ).setConstraints(onlyWhenOnline).build()
        // UPDATE rather than KEEP, so a phone that already has the widget picks
        // up a change of interval instead of keeping the one it was given.
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            UNIQUE_PERIODIC,
            ExistingPeriodicWorkPolicy.UPDATE,
            periodic
        )
    }

    fun refreshNow(context: Context) {
        val once = OneTimeWorkRequestBuilder<InvestmentWidgetRefreshWorker>()
            .setConstraints(onlyWhenOnline)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            UNIQUE_ONCE,
            ExistingWorkPolicy.REPLACE,
            once
        )
    }
}
