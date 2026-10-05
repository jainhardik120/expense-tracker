package com.jainhardik120.expensetracker.ui.screens

import com.jainhardik120.expensetracker.data.entity.TimelineDay
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val dayLabelFormat = DateTimeFormatter.ofPattern("EEE, d MMM yyyy", Locale.ENGLISH)

class StatementTimeline(private val days: List<TimelineDay>) {
    private val starts: IntArray = IntArray(days.size).also { starts ->
        var running = 0
        days.forEachIndexed { index, day ->
            starts[index] = running
            running += day.count
        }
    }

    val total: Int = days.sumOf { it.count }

    val isEmpty: Boolean get() = days.isEmpty()

    fun dayIndexAt(globalIndex: Int): Int {
        if (days.isEmpty()) return -1
        var low = 0
        var high = days.lastIndex
        while (low < high) {
            val mid = (low + high + 1) / 2
            if (starts[mid] <= globalIndex) low = mid else high = mid - 1
        }
        return low
    }

    fun startOf(dayIndex: Int): Int = starts[dayIndex]

    fun label(dayIndex: Int): String =
        runCatching { dayLabelFormat.format(LocalDate.parse(days[dayIndex].date)) }
            .getOrDefault(days[dayIndex].date)

    companion object {
        val EMPTY = StatementTimeline(emptyList())
    }
}
