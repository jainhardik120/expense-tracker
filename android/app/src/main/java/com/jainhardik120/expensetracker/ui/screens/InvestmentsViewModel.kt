package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.jainhardik120.expensetracker.data.entity.InstrumentChartPoint
import com.jainhardik120.expensetracker.data.entity.InstrumentPosition
import com.jainhardik120.expensetracker.data.entity.InvestmentHolding
import com.jainhardik120.expensetracker.data.entity.AllocationView
import com.jainhardik120.expensetracker.data.entity.EtfEstimate
import com.jainhardik120.expensetracker.data.entity.InvestmentsOverview
import com.jainhardik120.expensetracker.data.entity.TodayEstimate
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.ui.BaseViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val LIVE_CHART_INTERVAL_MS = 60_000L

enum class HoldingMetric(val label: String) {
    CURRENT("Current (Invested)"),
    RETURNS("Returns (%)"),
    DAY_CHANGE("Day change (%)"),
    XIRR("XIRR")
}

enum class ChartRange(val label: String, val value: String) {
    DAY("1D", "1d"),
    WEEK("1W", "1w"),
    MONTH("1M", "1m"),
    QUARTER("3M", "3m"),
    HALF("6M", "6m"),
    ALL("All", "lifetime")
}

@HiltViewModel
class InvestmentsViewModel @Inject constructor(
    private val api: ExpenseTrackerAPI
) : BaseViewModel() {

    var overview by mutableStateOf<InvestmentsOverview?>(null)
        private set

    var isLoading by mutableStateOf(false)
        private set

    var errorMessage by mutableStateOf<String?>(null)
        private set

    var selectedCategory by mutableStateOf<String?>(null)
        private set

    var showClosed by mutableStateOf(false)
        private set

    var todayEstimate by mutableStateOf<TodayEstimate?>(null)
        private set

    var etfEstimate by mutableStateOf<EtfEstimate?>(null)
        private set

    var showAllocation by mutableStateOf(false)
        private set

    var allocation by mutableStateOf<AllocationView?>(null)
        private set

    var allocationError by mutableStateOf<String?>(null)
        private set

    var metric by mutableStateOf(HoldingMetric.CURRENT)
        private set

    var openHolding by mutableStateOf<InvestmentHolding?>(null)
        private set

    var chartRange by mutableStateOf(ChartRange.HALF)
        private set

    var chartPoints by mutableStateOf<List<InstrumentChartPoint>?>(null)
        private set

    var chartError by mutableStateOf<String?>(null)
        private set

    var chartPositions by mutableStateOf<List<InstrumentPosition>>(emptyList())
        private set

    var chartIntraday by mutableStateOf(false)
        private set

    private var liveChartJob: Job? = null

    init {
        loadInvestments()
    }

    fun openAllocation() {
        showAllocation = true
        allocationError = null
        makeApiCall(
            call = { api.getAllocation() },
            preExecuting = null,
            onDoneExecuting = null,
            onException = { message -> allocationError = message }
        ) { response ->
            allocation = response
        }
    }

    fun closeAllocation() {
        showAllocation = false
    }

    fun openChart(holding: InvestmentHolding) {
        openHolding = holding
        chartPositions = emptyList()
        loadChart()
    }

    fun closeChart() {
        liveChartJob?.cancel()
        openHolding = null
        chartPoints = null
    }

    fun selectRange(range: ChartRange) {
        if (range == chartRange) return
        chartRange = range
        loadChart()
    }

    private fun loadChart() {
        requestChart(showLoading = true)
        liveChartJob?.cancel()
        if (chartRange == ChartRange.DAY) {
            liveChartJob = viewModelScope.launch {
                while (isActive) {
                    delay(LIVE_CHART_INTERVAL_MS)
                    requestChart(showLoading = false)
                }
            }
        }
    }

    private fun requestChart(showLoading: Boolean) {
        val holding = openHolding ?: return
        val range = chartRange
        if (showLoading) {
            chartError = null
        }
        makeApiCall(
            call = { api.getInstrumentChart(holding.kind, holding.code, holding.isRsu, range.value) },
            preExecuting = { if (showLoading) chartPoints = null },
            onDoneExecuting = null,
            onException = { message -> if (showLoading) chartError = message }
        ) { response ->
            if (openHolding == holding && chartRange == range) {
                chartPoints = response.points
                chartIntraday = response.intraday
                chartPositions = response.positions
            }
        }
    }

    fun selectCategory(category: String?) {
        selectedCategory = category
    }

    fun toggleClosed() {
        showClosed = !showClosed
    }

    fun cycleMetric() {
        val all = HoldingMetric.entries
        metric = all[(metric.ordinal + 1) % all.size]
    }

    fun loadInvestments() {
        errorMessage = null
        makeApiCall(
            call = { api.getInvestments() },
            preExecuting = { isLoading = true },
            onDoneExecuting = { isLoading = false },
            onException = { message -> errorMessage = message }
        ) { response ->
            overview = response
        }
        makeApiCall(
            call = { api.getTodayEstimate() },
            preExecuting = null,
            onDoneExecuting = null,
            onException = {}
        ) { response ->
            todayEstimate = response
        }
        makeApiCall(
            call = { api.getEtfEstimate() },
            preExecuting = null,
            onDoneExecuting = null,
            onException = {}
        ) { response ->
            etfEstimate = response
        }
    }
}
