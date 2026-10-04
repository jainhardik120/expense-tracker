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
import com.jainhardik120.expensetracker.settings.AppPreferences
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

@HiltWorker
class WidgetRefreshWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val api: ExpenseTrackerAPI,
    private val preferences: AppPreferences
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val day = preferences.currentDay()
        val iso = DateTimeFormatter.ISO_OFFSET_DATE_TIME
        return when (
            val result = api.getWidgetSummary(
                dayStart = day.start.format(iso),
                dayEnd = day.endInclusive.format(iso)
            )
        ) {
            is ApiResult.Success -> {
                val summary = result.data ?: return Result.retry()
                updateEvery(applicationContext) { prefs ->
                    prefs[WidgetKeys.balance] = summary.balance
                    prefs[WidgetKeys.spentToday] = summary.spentToday
                    prefs[WidgetKeys.pendingCount] = summary.pending.count
                    prefs[WidgetKeys.pendingAmount] = summary.pending.amount
                    prefs[WidgetKeys.hasBudget] = if (summary.budget == null) 0 else 1
                    prefs[WidgetKeys.perDay] = summary.budget?.perDay ?: 0.0
                    prefs[WidgetKeys.remainingThisMonth] = summary.budget?.remainingThisMonth ?: 0.0
                    prefs[WidgetKeys.updatedAt] = System.currentTimeMillis()
                    prefs.remove(WidgetKeys.error)
                }
                Result.success()
            }

            is ApiResult.ClientException -> {
                Log.e(TAG, "Widget refresh refused: ${result.statusCode}")
                updateEvery(applicationContext) { it[WidgetKeys.error] = "sign in needed" }
                Result.failure()
            }

            is ApiResult.Exception -> {
                Log.w(TAG, "Widget refresh failed: ${result.errorMessage}")
                updateEvery(applicationContext) { it[WidgetKeys.error] = "offline" }
                Result.retry()
            }
        }
    }

    private companion object {
        const val TAG = "WidgetRefreshWorker"
    }
}

private suspend fun updateEvery(context: Context, edit: (MutablePreferences) -> Unit) {
    val manager = GlanceAppWidgetManager(context)
    val widget = BalanceWidget()
    val ids: List<GlanceId> = manager.getGlanceIds(BalanceWidget::class.java)
    for (id in ids) {
        updateAppWidgetState(context, id) { prefs -> edit(prefs) }
    }
    widget.updateAll(context)
}

class RefreshWidgetAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: androidx.glance.action.ActionParameters
    ) {
        WidgetRefreshScheduler.refreshNow(context)
    }
}

object WidgetRefreshScheduler {
    private const val UNIQUE_PERIODIC = "widget-refresh-periodic"
    private const val UNIQUE_ONCE = "widget-refresh-now"
    private const val REFRESH_MINUTES = 15L
    private const val BACKOFF_SECONDS = 30L

    private val onlyWhenOnline = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun ensureScheduled(context: Context) {
        val periodic = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(
            REFRESH_MINUTES, TimeUnit.MINUTES
        ).setConstraints(onlyWhenOnline).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            UNIQUE_PERIODIC,
            ExistingPeriodicWorkPolicy.UPDATE,
            periodic
        )
    }

    fun refreshNow(context: Context) {
        val once = OneTimeWorkRequestBuilder<WidgetRefreshWorker>()
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

@EntryPoint
@InstallIn(SingletonComponent::class)
interface WidgetEntryPoint {
    fun preferences(): AppPreferences
}

fun widgetPreferences(context: Context): AppPreferences =
    EntryPointAccessors.fromApplication(
        context.applicationContext,
        WidgetEntryPoint::class.java
    ).preferences()
