package com.jainhardik120.expensetracker.widget

import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey

/**
 * What the investment widget draws, in its own Glance state.
 *
 * Separate from [WidgetKeys] rather than shared: the two widgets are fed by
 * different endpoints on different timers, and one sharing the other's store
 * would blank half its tiles every time the other refreshed.
 */
object InvestmentWidgetKeys {
    val valuation: Preferences.Key<Double> = doublePreferencesKey("inv_valuation")
    val invested: Preferences.Key<Double> = doublePreferencesKey("inv_invested")
    val pnl: Preferences.Key<Double> = doublePreferencesKey("inv_pnl")
    val pnlPercentage: Preferences.Key<Double> = doublePreferencesKey("inv_pnl_pct")
    val dayChange: Preferences.Key<Double> = doublePreferencesKey("inv_day_change")
    val dayChangePercentage: Preferences.Key<Double> = doublePreferencesKey("inv_day_pct")
    /** A percentage is genuinely absent when nothing is invested, and 0 is a lie. */
    val hasPnlPercentage: Preferences.Key<Int> = intPreferencesKey("inv_has_pnl_pct")
    val hasDayChangePercentage: Preferences.Key<Int> = intPreferencesKey("inv_has_day_pct")
    val updatedAt: Preferences.Key<Long> = longPreferencesKey("inv_updated_at")
    val error: Preferences.Key<String> = stringPreferencesKey("inv_error")
}
