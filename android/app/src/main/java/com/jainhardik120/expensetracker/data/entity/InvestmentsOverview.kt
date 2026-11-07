package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

@Serializable
data class InvestmentsOverview(
    val asOf: String,
    val pricesAsOf: String? = null,
    val summary: PortfolioSummary,
    val categories: List<InvestmentCategory>,
    val holdings: List<InvestmentHolding>,
    val positions: List<IndividualPosition> = emptyList(),
    val epfo: EpfoSummary = EpfoSummary()
)

@Serializable
data class EpfoSummary(
    val pending: List<EpfoPendingCredit> = emptyList(),
    val pendingAmount: Double = 0.0,
    val pendingInterest: Double = 0.0,
    val interestYears: List<EpfoInterestYear> = emptyList()
)

@Serializable
data class EpfoPendingCredit(
    val salaryPaymentId: String,
    val periodStart: String,
    val dueMonth: String,
    val expectedAmount: Double,
    val estimatedInterest: Double
)

@Serializable
data class EpfoInterestYear(
    val financialYearStart: Int,
    val amount: Double,
    val isCredited: Boolean
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
    val salaryPeriodStart: String? = null,
    val isClosed: Boolean,
    val isExcludedFromPortfolio: Boolean
)

@Serializable
data class TodayEstimate(
    val marketOpen: Boolean,
    val navDate: String? = null,
    val oldestNavDate: String? = null,
    val estimateDate: String? = null,
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
data class MarketItem(
    val key: String,
    val label: String,
    val unit: String? = null,
    val isCurrency: Boolean = false,
    val price: Double? = null,
    val changePercentage: Double? = null
)

@Serializable
data class MarketSnapshot(val items: List<MarketItem> = emptyList())

@Serializable
data class MarketPoint(val date: String, val price: Double)

@Serializable
data class MarketChart(
    val points: List<MarketPoint> = emptyList(),
    val previousClose: Double? = null
)

@Serializable
data class IndexComponent(
    val name: String,
    val sector: String? = null,
    val weight: Double,
    val price: Double? = null,
    val changePercent: Double? = null
)

@Serializable
data class IndexComponents(
    val etfName: String = "",
    val components: List<IndexComponent> = emptyList()
)

@Serializable
data class SeriesPoint(val time: Long, val price: Double)

@Serializable
data class MetalCharts(
    val unit: String,
    val etfSymbol: String,
    val etfName: String = "",
    val start: Long,
    val end: Long,
    val etfNow: Double? = null,
    val etfBase: Double? = null,
    val mcxBase: Double? = null,
    val etf: List<SeriesPoint> = emptyList(),
    val etfEstimate: List<SeriesPoint> = emptyList(),
    val mcx: List<SeriesPoint> = emptyList(),
    val mcxEstimate: List<SeriesPoint> = emptyList(),
    val comex: List<SeriesPoint> = emptyList(),
    val india: List<SeriesPoint> = emptyList()
)

@Serializable
data class MetalBuyPrice(
    val code: String,
    val etf: Double? = null,
    val mcx: Double? = null,
    val mcxCoverage: Double = 0.0
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
    val realizedPnl: Double = 0.0,
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
    val realizedPnl: Double = 0.0,
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
    val intraday: Boolean = false,
    val firstBought: String? = null
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
