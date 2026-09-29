package com.jainhardik120.expensetracker.widget

import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * Money as a widget shows it: rounded to rupees.
 *
 * A widget is a few square centimetres read at arm's length. Paise there cost
 * two glyphs and tell you nothing, so they are dropped -- and dropped in one
 * place, so both widgets round the same way.
 */
fun money(value: Double?): String {
    if (value == null) {
        return "--"
    }
    val rounded = value.roundToLong()
    val formatted = NumberFormat.getIntegerInstance(Locale.forLanguageTag("en-IN")).format(abs(rounded))
    return if (rounded < 0) "-₹$formatted" else "₹$formatted"
}

/** As [money], but always carrying its sign: a gain is not just a number. */
fun signedMoney(value: Double?): String {
    if (value == null) {
        return "--"
    }
    return if (value < 0) money(value) else "+${money(value)}"
}
