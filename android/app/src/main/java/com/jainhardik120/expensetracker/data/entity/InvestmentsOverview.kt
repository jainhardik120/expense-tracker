package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

@Serializable
data class InvestmentsOverview(
    val asOf: String,
    val summary: PortfolioSummary,
    val categories: List<InvestmentCategory>,
    val holdings: List<InvestmentHolding>
)

@Serializable
data class PortfolioSummary(
    val invested: Double,
    val valuation: Double,
    val pnl: Double,
    val pnlPercentage: Double? = null,
    val dayChange: Double,
    val dayChangePercentage: Double? = null,
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
    val invested: Double,
    val valuation: Double,
    val pnl: Double,
    val pnlPercentage: Double? = null,
    val dayChange: Double,
    val dayChangePercentage: Double? = null,
    val openPositions: Int,
    val totalPositions: Int
)
