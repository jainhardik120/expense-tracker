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

private val dollarFormat: NumberFormat = NumberFormat.getCurrencyInstance(Locale.US).apply {
    minimumFractionDigits = 2
    maximumFractionDigits = 2
}

private val wholeDollarFormat: NumberFormat = NumberFormat.getCurrencyInstance(Locale.US).apply {
    maximumFractionDigits = 0
}

fun formatDollars(value: Double): String = synchronized(dollarFormat) { dollarFormat.format(value) }

fun wholeDollars(value: Double): String = synchronized(wholeDollarFormat) { wholeDollarFormat.format(value) }
