package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.jainhardik120.expensetracker.data.entity.SummaryResponse
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.ui.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
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

    init {
        loadSummary()
    }

    fun loadSummary() {
        errorMessage = null
        makeApiCall(
            call = { api.getSummary() },
            preExecuting = { isLoading = true },
            onDoneExecuting = { isLoading = false },
            onException = { msg ->
                errorMessage = msg
            }
        ) { response ->
            summary = response
        }
    }
}
