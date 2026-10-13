package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

@Serializable
data class DayExpense(
    val date: String,
    val expenses: Double
)

@Serializable
data class CategoryAmount(
    val category: String,
    val amount: Double
)

@Serializable
data class ChartData(
    val days: List<DayExpense>,
    val categories: List<CategoryAmount>
)
