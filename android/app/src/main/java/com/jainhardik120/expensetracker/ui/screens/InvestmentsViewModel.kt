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
import com.jainhardik120.expensetracker.data.entity.MarketItem
import com.jainhardik120.expensetracker.data.entity.MarketPoint
import com.jainhardik120.expensetracker.data.entity.MetalBuyPrice
import com.jainhardik120.expensetracker.data.entity.MetalCharts
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
private val METAL_KEYS = setOf("gold", "silver")

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

    var isRefreshFailing by mutableStateOf(false)
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

    var markets by mutableStateOf<List<MarketItem>>(emptyList())
        private set

    var openMarket by mutableStateOf<MarketItem?>(null)
        private set

    var marketRange by mutableStateOf(ChartRange.DAY)
        private set

    var marketPoints by mutableStateOf<List<MarketPoint>?>(null)
        private set

    var marketPreviousClose by mutableStateOf<Double?>(null)
        private set

    var marketError by mutableStateOf<String?>(null)
        private set

    var metalCharts by mutableStateOf<MetalCharts?>(null)
        private set

    var metalBuyPrices by mutableStateOf<List<MetalBuyPrice>>(emptyList())
        private set

    private var liveMarketJob: Job? = null

    init {
        loadInvestments()
    }

    fun refreshMarkets() {
        makeApiCall(
            call = { api.getMarkets() },
            preExecuting = null,
            onDoneExecuting = null,
            onException = {}
        ) { response ->
            markets = response.items
        }
    }

    fun openMarketChart(item: MarketItem) {
        refreshMarkets()
        openMarket = item
        marketRange = ChartRange.DAY
        if (item.key in METAL_KEYS) {
            makeApiCall(
                call = { api.getMetalBuyPrices() },
                preExecuting = null,
                onDoneExecuting = null,
                onException = {}
            ) { response ->
                metalBuyPrices = response
            }
        }
        loadMarketChart()
    }

    fun closeMarketChart() {
        liveMarketJob?.cancel()
        openMarket = null
        marketPoints = null
        metalCharts = null
    }

    fun selectMarketRange(range: ChartRange) {
        if (range == marketRange) return
        marketRange = range
        loadMarketChart()
    }

    private fun loadMarketChart() {
        requestMarketChart(showLoading = true)
        liveMarketJob?.cancel()
        liveMarketJob = viewModelScope.launch {
            while (isActive) {
                delay(LIVE_CHART_INTERVAL_MS)
                requestMarketChart(showLoading = false)
            }
        }
    }

    private fun requestMarketChart(showLoading: Boolean) {
        val item = openMarket ?: return
        val range = marketRange
        if (showLoading) {
            marketError = null
        }
        if (item.key in METAL_KEYS) {
            makeApiCall(
                call = { api.getMetalCharts(item.key, range.value) },
                preExecuting = { if (showLoading) metalCharts = null },
                onDoneExecuting = null,
                onException = { message -> if (showLoading) marketError = message }
            ) { response ->
                if (openMarket == item && marketRange == range) {
                    metalCharts = response
                }
            }
            return
        }
        makeApiCall(
            call = { api.getMarketChart(item.key, range.value) },
            preExecuting = { if (showLoading) marketPoints = null },
            onDoneExecuting = null,
            onException = { message -> if (showLoading) marketError = message }
        ) { response ->
            if (openMarket == item && marketRange == range) {
                marketPoints = response.points
                marketPreviousClose = response.previousClose
            }
        }
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
        liveChartJob = viewModelScope.launch {
            while (isActive) {
                delay(LIVE_CHART_INTERVAL_MS)
                requestChart(showLoading = false)
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
            if (openHolding?.isSameAs(holding) == true && chartRange == range) {
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

    private fun applyOverview(response: InvestmentsOverview) {
        overview = response
        isRefreshFailing = false
        openHolding = openHolding?.let { open ->
            response.holdings.firstOrNull { it.isSameAs(open) } ?: open
        }
    }

    fun loadInvestments() {
        errorMessage = null
        makeApiCall(
            call = { api.getInvestments() },
            preExecuting = { isLoading = true },
            onDoneExecuting = { isLoading = false },
            onException = { message ->
                errorMessage = message
                isRefreshFailing = true
            }
        ) { response ->
            applyOverview(response)
        }
        loadEstimates()
        refreshMarkets()
    }

    fun refreshLive() {
        makeApiCall(
            call = { api.getInvestments() },
            preExecuting = null,
            onDoneExecuting = null,
            onException = { isRefreshFailing = true }
        ) { response ->
            applyOverview(response)
        }
        loadEstimates()
        refreshMarkets()
    }

    private fun loadEstimates() {
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

private fun InvestmentHolding.isSameAs(other: InvestmentHolding) =
    kind == other.kind && code == other.code && isRsu == other.isRsu
