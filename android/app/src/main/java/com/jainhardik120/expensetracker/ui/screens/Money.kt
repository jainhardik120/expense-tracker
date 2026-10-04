package com.jainhardik120.expensetracker.ui.screens

import java.text.NumberFormat
import java.util.Locale

fun formatAmount(value: Double): String {
    val formatter = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN"))
    formatter.maximumFractionDigits = 2
    return formatter.format(value)
}
