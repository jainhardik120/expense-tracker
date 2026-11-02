package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.jainhardik120.expensetracker.data.entity.InstrumentChartPoint
import com.jainhardik120.expensetracker.data.entity.InstrumentPosition
import com.jainhardik120.expensetracker.data.entity.InvestmentHolding
import com.jainhardik120.expensetracker.data.entity.InvestmentsOverview
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.ui.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

enum class HoldingMetric(val label: String) {
    CURRENT("Current (Invested)"),
    RETURNS("Returns (%)"),
    DAY_CHANGE("Day change (%)"),
    XIRR("XIRR")
}

enum class ChartRange(val label: String, val value: String) {
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

    init {
        loadInvestments()
    }

    fun openChart(holding: InvestmentHolding) {
        openHolding = holding
        chartPositions = emptyList()
        loadChart()
    }

    fun closeChart() {
        openHolding = null
        chartPoints = null
    }

    fun selectRange(range: ChartRange) {
        if (range == chartRange) return
        chartRange = range
        loadChart()
    }

    private fun loadChart() {
        val holding = openHolding ?: return
        val range = chartRange
        chartError = null
        makeApiCall(
            call = { api.getInstrumentChart(holding.kind, holding.code, holding.isRsu, range.value) },
            preExecuting = { chartPoints = null },
            onDoneExecuting = null,
            onException = { message -> chartError = message }
        ) { response ->
            if (openHolding == holding && chartRange == range) {
                chartPoints = response.points
                chartPositions = response.positions
            }
        }
    }

    fun selectCategory(category: String?) {
        selectedCategory = category
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
    }
}
