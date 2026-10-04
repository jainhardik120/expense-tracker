package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.jainhardik120.expensetracker.data.entity.InvestmentsOverview
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.ui.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class InvestmentsViewModel @Inject constructor(
    private val api: ExpenseTrackerAPI
) : BaseViewModel() {

    var overview by mutableStateOf<InvestmentsOverview?>(null)
        private set

    var isLoading by mutableStateOf(false)
        private set

    var errorMessage by mutableStateOf<String?>(null)
        private set

    var expandedCategory by mutableStateOf<String?>(null)
        private set

    init {
        loadInvestments()
    }

    fun toggleCategory(category: String) {
        expandedCategory = if (expandedCategory == category) null else category
    }

    fun loadInvestments() {
        errorMessage = null
        makeApiCall(
            call = { api.getInvestments() },
            preExecuting = { isLoading = true },
            onDoneExecuting = { isLoading = false },
            onException = { message -> errorMessage = message }
        ) { response ->
            overview = response
        }
    }
}
