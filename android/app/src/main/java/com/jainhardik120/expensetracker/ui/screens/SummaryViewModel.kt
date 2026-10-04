package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.jainhardik120.expensetracker.data.entity.SummaryResponse
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.ui.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@HiltViewModel
class SummaryViewModel @Inject constructor(
    private val api: ExpenseTrackerAPI
) : BaseViewModel() {

    var summary by mutableStateOf<SummaryResponse?>(null)
        private set

    var isLoading by mutableStateOf(false)
        private set

    var errorMessage by mutableStateOf<String?>(null)
        private set

    var month by mutableStateOf(YearMonth.now())
        private set

    val isCurrentMonth: Boolean get() = month == YearMonth.now()

    init {
        loadSummary()
    }

    fun showPreviousMonth() {
        month = month.minusMonths(1)
        loadSummary()
    }

    fun showNextMonth() {
        if (isCurrentMonth) return
        month = month.plusMonths(1)
        loadSummary()
    }

    fun loadSummary() {
        errorMessage = null
        val zone = ZoneId.systemDefault()
        val start = month.atDay(1).atStartOfDay(zone)
        val end = month.atEndOfMonth().atTime(END_OF_DAY_HOUR, LAST_MINUTE, LAST_SECOND).atZone(zone)
        makeApiCall(
            call = {
                api.getSummary(
                    start = start.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                    end = end.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                )
            },
            preExecuting = { isLoading = true },
            onDoneExecuting = { isLoading = false },
            onException = { msg ->
                errorMessage = msg
            }
        ) { response ->
            summary = response
        }
    }

    private companion object {
        const val END_OF_DAY_HOUR = 23
        const val LAST_MINUTE = 59
        const val LAST_SECOND = 59
    }
}
