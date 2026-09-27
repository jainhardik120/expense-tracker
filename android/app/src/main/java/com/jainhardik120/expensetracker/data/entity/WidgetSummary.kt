package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

/** The four numbers the home-screen widget shows, in one response. */
@Serializable
data class WidgetSummary(
    val balance: Double,
    val spentToday: Double,
    val pending: PendingSummary,
    val budget: BudgetSummary?,
    val asOf: String
)

@Serializable
data class PendingSummary(
    val count: Int,
    val amount: Double
)

@Serializable
data class BudgetSummary(
    val perDay: Double,
    val perMonth: Double,
    val remainingThisMonth: Double,
    val goal: Double
)
