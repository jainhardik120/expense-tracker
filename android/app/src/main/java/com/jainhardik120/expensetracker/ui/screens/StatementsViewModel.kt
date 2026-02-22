package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.jainhardik120.expensetracker.data.entity.StatementItem
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.ui.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class StatementsViewModel @Inject constructor(
    private val api: ExpenseTrackerAPI
) : BaseViewModel() {

    var statements by mutableStateOf<List<StatementItem>>(emptyList())
        private set

    var isLoading by mutableStateOf(false)
        private set

    var isLoadingMore by mutableStateOf(false)
        private set

    var hasMorePages by mutableStateOf(true)
        private set

    private var currentPage by mutableIntStateOf(1)
    private val perPage = 15

    var errorMessage by mutableStateOf<String?>(null)
        private set

    init {
        loadStatements()
    }

    fun loadStatements() {
        currentPage = 1
        hasMorePages = true
        errorMessage = null
        makeApiCall(
            call = { api.getStatements(page = 1, perPage = perPage) },
            preExecuting = { isLoading = true },
            onDoneExecuting = { isLoading = false },
            onException = { msg ->
                errorMessage = msg
            }
        ) { response ->
            statements = response.statements
            hasMorePages = currentPage < response.pageCount
        }
    }

    fun loadMoreStatements() {
        if (isLoadingMore || !hasMorePages) return
        val nextPage = currentPage + 1
        makeApiCall(
            call = { api.getStatements(page = nextPage, perPage = perPage) },
            preExecuting = { isLoadingMore = true },
            onDoneExecuting = { isLoadingMore = false },
            onException = { msg ->
                errorMessage = msg
            }
        ) { response ->
            statements = statements + response.statements
            currentPage = nextPage
            hasMorePages = nextPage < response.pageCount
        }
    }
}
