package com.jainhardik120.expensetracker.ui.screens

import java.text.NumberFormat
import java.util.Locale

private val rupeeFormat: NumberFormat =
    NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN")).apply {
        minimumFractionDigits = 2
        maximumFractionDigits = 2
    }

fun formatAmount(value: Double): String = synchronized(rupeeFormat) { rupeeFormat.format(value) }

fun formatAmount(value: String): String = value.toDoubleOrNull()?.let(::formatAmount) ?: value

fun formatSignedAmount(value: Double): String =
    if (value > 0) "+${formatAmount(value)}" else formatAmount(value)
