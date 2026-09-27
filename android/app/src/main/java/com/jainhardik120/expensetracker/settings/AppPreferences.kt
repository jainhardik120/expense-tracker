package com.jainhardik120.expensetracker.settings

import android.content.Context
import androidx.core.content.edit
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Where the day starts, and everything that follows from it.
 *
 * A meal ordered at one in the morning belongs to the evening it followed, not
 * to the calendar date the clock had already rolled over to, so "today" is a
 * window the owner of the phone gets to define.
 */
@Singleton
class AppPreferences @Inject constructor(
    @param:ApplicationContext private val context: Context
) {
    private val prefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)

    var dayStartHour: Int
        get() = prefs.getInt(KEY_DAY_START_HOUR, DEFAULT_DAY_START_HOUR)
        set(value) = prefs.edit { putInt(KEY_DAY_START_HOUR, value.coerceIn(0, LAST_HOUR)) }

    /** The window "today" means right now: [start, start + 24h). */
    fun currentDay(zone: ZoneId = ZoneId.systemDefault()): ClosedRange<ZonedDateTime> {
        val now = ZonedDateTime.now(zone)
        var start = now.with(LocalTime.of(dayStartHour, 0))
        if (now.isBefore(start)) {
            start = start.minusDays(1)
        }
        return start..start.plusDays(1)
    }

    private companion object {
        const val KEY_DAY_START_HOUR = "day_start_hour"
        const val DEFAULT_DAY_START_HOUR = 6
        const val LAST_HOUR = 23
    }
}
