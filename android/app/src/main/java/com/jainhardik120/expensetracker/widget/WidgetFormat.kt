package com.jainhardik120.expensetracker.widget

import android.content.Context
import android.net.ConnectivityManager
import android.os.PowerManager
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
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

private val TIME = DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault())
private val DAY_TIME = DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale.getDefault())

private fun updatedLabel(updatedAt: Long): String {
    val moment = Instant.ofEpochMilli(updatedAt).atZone(ZoneId.systemDefault())
    val format = if (moment.toLocalDate() == LocalDate.now()) TIME else DAY_TIME
    return "Updated ${format.format(moment)}"
}

fun footerText(updatedAt: Long?, error: String?): String = when {
    error != null && updatedAt != null -> "${updatedLabel(updatedAt)} · $error"
    error != null -> "$error · tap to retry"
    updatedAt != null -> updatedLabel(updatedAt)
    else -> "Tap to load"
}

fun refreshBlocker(context: Context): String {
    val power = context.getSystemService(PowerManager::class.java)
    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    return when {
        power.isPowerSaveMode && !power.isIgnoringBatteryOptimizations(context.packageName) -> "Battery Saver on"
        connectivity.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED -> "Data Saver on"
        connectivity.activeNetwork == null -> "no connection"
        else -> "can't reach server"
    }
}
