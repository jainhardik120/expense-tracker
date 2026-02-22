package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.jainhardik120.expensetracker.data.entity.AccountItem
import com.jainhardik120.expensetracker.data.entity.CreateSelfTransferBody
import com.jainhardik120.expensetracker.data.entity.CreateStatementBody
import com.jainhardik120.expensetracker.data.entity.FriendItem
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

    var accounts by mutableStateOf<List<AccountItem>>(emptyList())
        private set

    var friends by mutableStateOf<List<FriendItem>>(emptyList())
        private set

    var showCreateDialog by mutableStateOf(false)
        private set

    var isSaving by mutableStateOf(false)
        private set

    init {
        loadStatements()
        loadAccounts()
        loadFriends()
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

    private fun loadAccounts() {
        makeApiCall(call = { api.getAccounts() }) { response ->
            accounts = response
        }
    }

    private fun loadFriends() {
        makeApiCall(call = { api.getFriends() }) { response ->
            friends = response
        }
    }

    fun openCreateDialog() {
        showCreateDialog = true
    }

    fun closeCreateDialog() {
        showCreateDialog = false
    }

    fun createStatement(body: CreateStatementBody) {
        makeApiCall(
            call = { api.createStatement(body) },
            preExecuting = { isSaving = true },
            onDoneExecuting = { isSaving = false }
        ) {
            showCreateDialog = false
            loadStatements()
        }
    }

    fun createSelfTransfer(body: CreateSelfTransferBody) {
        makeApiCall(
            call = { api.createSelfTransfer(body) },
            preExecuting = { isSaving = true },
            onDoneExecuting = { isSaving = false }
        ) {
            showCreateDialog = false
            loadStatements()
        }
    }

    fun deleteStatement(item: StatementItem) {
        val apiCall = if (item.type == "self_transfer") {
            suspend { api.deleteSelfTransfer(item.id) }
        } else {
            suspend { api.deleteStatement(item.id) }
        }
        makeApiCall(call = apiCall) {
            statements = statements.filter { it.id != item.id }
        }
    }
}
