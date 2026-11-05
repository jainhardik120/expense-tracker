package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

@Serializable
data class InvestmentsOverview(
    val asOf: String,
    val summary: PortfolioSummary,
    val categories: List<InvestmentCategory>,
    val holdings: List<InvestmentHolding>,
    val positions: List<IndividualPosition> = emptyList()
)

@Serializable
data class IndividualPosition(
    val id: String,
    val category: String,
    val name: String,
    val date: String,
    val invested: Double,
    val valuation: Double,
    val dayChange: Double,
    val annualRate: Double? = null,
    val maturityDate: String? = null,
    val isClosed: Boolean,
    val isExcludedFromPortfolio: Boolean
)

@Serializable
data class TodayEstimate(
    val marketOpen: Boolean,
    val navDate: String? = null,
    val percents: Map<String, Double> = emptyMap()
)

@Serializable
data class AllocationSlice(
    val key: String,
    val colorKey: String,
    val label: String,
    val share: Double,
    val invested: Double,
    val value: Double,
    val dayChange: Double
)

@Serializable
data class AllocationGroup(
    val key: String,
    val colorKey: String,
    val label: String,
    val share: Double,
    val invested: Double,
    val value: Double,
    val dayChange: Double,
    val kinds: List<AllocationSlice> = emptyList(),
    val buckets: List<AllocationSlice> = emptyList()
) {
    val slice get() = AllocationSlice(key, colorKey, label, share, invested, value, dayChange)
}

@Serializable
data class AllocationView(
    val groups: List<AllocationGroup> = emptyList(),
    val holdingsDate: String? = null
)

@Serializable
data class EtfEstimate(
    val percents: Map<String, Double> = emptyMap()
)

@Serializable
data class PortfolioSummary(
    val invested: Double,
    val valuation: Double,
    val pnl: Double,
    val pnlPercentage: Double? = null,
    val dayChange: Double,
    val dayChangePercentage: Double? = null,
    val xirr: Double? = null,
    val openPositions: Int,
    val closedPositions: Int,
    val totalPositions: Int
)

@Serializable
data class InvestmentCategory(
    val category: String,
    val label: String,
    val invested: Double,
    val valuation: Double,
    val pnl: Double,
    val pnlPercentage: Double? = null,
    val dayChange: Double,
    val dayChangePercentage: Double? = null,
    val xirr: Double? = null,
    val openPositions: Int,
    val totalPositions: Int
)

@Serializable
data class InvestmentHolding(
    val kind: String,
    val category: String,
    val label: String,
    val code: String,
    val name: String,
    val currency: String,
    val isRsu: Boolean,
    val isExcludedFromPortfolio: Boolean,
    val units: Double,
    val investedInr: Double = 0.0,
    val valuationInr: Double = 0.0,
    val dayChangeInr: Double = 0.0,
    val invested: Double,
    val valuation: Double,
    val pnl: Double,
    val pnlPercentage: Double? = null,
    val dayChange: Double,
    val dayChangePercentage: Double? = null,
    val xirr: Double? = null,
    val openPositions: Int,
    val totalPositions: Int
)

@Serializable
data class InstrumentChart(
    val points: List<InstrumentChartPoint>,
    val positions: List<InstrumentPosition> = emptyList(),
    val intraday: Boolean = false
)

@Serializable
data class InstrumentPosition(
    val id: String,
    val date: String,
    val units: Double? = null,
    val investedAmount: Double,
    val valuationAmount: Double,
    val investedDisplay: Double? = null,
    val valuationDisplay: Double? = null,
    val isClosed: Boolean,
    val closedAt: String? = null
)

@Serializable
data class InstrumentChartPoint(
    val date: String,
    val unitPrice: Double,
    val holdingValue: Double,
    val investedAmount: Double,
    val unitPriceDisplay: Double? = null,
    val holdingValueDisplay: Double? = null
)
