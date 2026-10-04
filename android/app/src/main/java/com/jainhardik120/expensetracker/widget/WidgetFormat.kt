package com.jainhardik120.expensetracker.widget

import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

fun money(value: Double?): String {
    if (value == null) {
        return "--"
    }
    val rounded = value.roundToLong()
    val formatted = NumberFormat.getIntegerInstance(Locale.forLanguageTag("en-IN")).format(abs(rounded))
    return if (rounded < 0) "-₹$formatted" else "₹$formatted"
}

fun signedMoney(value: Double?): String {
    if (value == null) {
        return "--"
    }
    return if (value < 0) money(value) else "+${money(value)}"
}
