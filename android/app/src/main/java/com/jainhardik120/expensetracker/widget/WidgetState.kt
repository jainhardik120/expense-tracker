package com.jainhardik120.expensetracker.widget

import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey

/**
 * What the widget draws, held in its own Glance state.
 *
 * A widget is asked to draw itself at moments nobody chose — a reboot, a
 * launcher restart, the screen coming on — and cannot wait on the network to
 * do it. So the last good answer is kept here and drawn immediately, with the
 * time it was fetched, and the refresh happens behind it.
 */
object WidgetKeys {
    val balance: Preferences.Key<Double> = doublePreferencesKey("balance")
    val spentToday: Preferences.Key<Double> = doublePreferencesKey("spent_today")
    val pendingCount: Preferences.Key<Int> = intPreferencesKey("pending_count")
    val pendingAmount: Preferences.Key<Double> = doublePreferencesKey("pending_amount")
    val perDay: Preferences.Key<Double> = doublePreferencesKey("budget_per_day")
    val remainingThisMonth: Preferences.Key<Double> = doublePreferencesKey("budget_remaining")
    val hasBudget: Preferences.Key<Int> = intPreferencesKey("has_budget")
    val updatedAt: Preferences.Key<Long> = longPreferencesKey("updated_at")
    val error: Preferences.Key<String> = stringPreferencesKey("error")
}
