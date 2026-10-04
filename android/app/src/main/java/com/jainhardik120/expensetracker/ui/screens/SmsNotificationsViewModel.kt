package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.jainhardik120.expensetracker.data.entity.AccountItem
import com.jainhardik120.expensetracker.data.entity.CreateSelfTransferBody
import com.jainhardik120.expensetracker.data.entity.CreateStatementBody
import com.jainhardik120.expensetracker.data.entity.FriendItem
import com.jainhardik120.expensetracker.data.entity.SmsNotificationItem
import com.jainhardik120.expensetracker.data.entity.UpdateSmsNotificationBody
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.ui.BaseViewModel
import com.jainhardik120.expensetracker.ui.UiEvent
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

enum class SmsFilter(val label: String, val status: String?) {
    Pending("Pending", "pending"),
    Inserted("Added", "inserted"),
    Junked("Junked", "junked"),
    All("All", null)
}

@HiltViewModel
class SmsNotificationsViewModel @Inject constructor(
    private val api: ExpenseTrackerAPI
) : BaseViewModel() {

    var filter by mutableStateOf(SmsFilter.Pending)
        private set

    var notifications by mutableStateOf<List<SmsNotificationItem>>(emptyList())
        private set

    var totalCount by mutableIntStateOf(0)
        private set

    var isLoading by mutableStateOf(false)
        private set

    var isLoadingMore by mutableStateOf(false)
        private set

    var hasMorePages by mutableStateOf(true)
        private set

    var errorMessage by mutableStateOf<String?>(null)
        private set

    var accounts by mutableStateOf<List<AccountItem>>(emptyList())
        private set

    var friends by mutableStateOf<List<FriendItem>>(emptyList())
        private set

    var categories by mutableStateOf<List<String>>(emptyList())
        private set

    var tags by mutableStateOf<List<String>>(emptyList())
        private set

    var converting by mutableStateOf<SmsNotificationItem?>(null)
        private set

    var prefill by mutableStateOf<StatementPrefill?>(null)
        private set

    var isSaving by mutableStateOf(false)
        private set

    var busyId by mutableStateOf<String?>(null)
        private set

    private var currentPage = 1
    private val perPage = 20

    init {
        loadNotifications()
        makeApiCall(call = { api.getAccounts() }) { accounts = it }
        makeApiCall(call = { api.getFriends() }) { friends = it }
        loadSuggestions()
    }

    private fun loadSuggestions() {
        makeApiCall(call = { api.getCategories() }) { categories = it }
        makeApiCall(call = { api.getTags() }) { tags = it }
    }

    fun selectFilter(value: SmsFilter) {
        if (value == filter) return
        filter = value
        notifications = emptyList()
        loadNotifications()
    }

    fun loadNotifications() {
        val requestedFilter = filter
        currentPage = 1
        hasMorePages = true
        errorMessage = null
        makeApiCall(
            call = { api.getSmsNotifications(page = 1, perPage = perPage, status = requestedFilter.status) },
            preExecuting = { isLoading = true },
            onDoneExecuting = { isLoading = false },
            onException = { errorMessage = it }
        ) { response ->
            if (requestedFilter != filter) return@makeApiCall
            notifications = response.notifications
            totalCount = response.rowsCount
            hasMorePages = 1 < response.pageCount
        }
    }

    fun loadMore() {
        if (isLoading || isLoadingMore || !hasMorePages) return
        val requestedFilter = filter
        val nextPage = currentPage + 1
        makeApiCall(
            call = { api.getSmsNotifications(page = nextPage, perPage = perPage, status = requestedFilter.status) },
            preExecuting = { isLoadingMore = true },
            onDoneExecuting = { isLoadingMore = false }
        ) { response ->
            if (requestedFilter != filter) return@makeApiCall
            val known = notifications.map { it.id }.toSet()
            notifications = notifications + response.notifications.filterNot { it.id in known }
            currentPage = nextPage
            hasMorePages = nextPage < response.pageCount
        }
    }

    fun startConverting(item: SmsNotificationItem) {
        busyId = item.id
        makeApiCall(
            call = { api.getSmsInsertHints(item.id) },
            preExecuting = null,
            onDoneExecuting = { busyId = null },
            onException = { openConversion(item, null, null, emptyList()) }
        ) { hints ->
            openConversion(
                item = item,
                accountId = hints.bankIdHint.firstOrNull(),
                category = hints.categoryHint.firstOrNull(),
                tags = hints.tagsHint.take(1)
            )
        }
    }

    private fun openConversion(
        item: SmsNotificationItem,
        accountId: String?,
        category: String?,
        tags: List<String>
    ) {
        val incoming = item.type == "income"
        converting = item
        prefill = StatementPrefill(
            amount = item.amount,
            createdAt = item.createdAt,
            statementKind = if (incoming) "outside_transaction" else "expense",
            category = category.orEmpty(),
            tags = tags,
            accountId = accountId,
            fromAccountId = accountId
        )
    }

    fun cancelConverting() {
        converting = null
        prefill = null
    }

    fun createStatement(body: CreateStatementBody) {
        val item = converting ?: return
        makeApiCall(
            call = { api.createStatement(body) },
            preExecuting = { isSaving = true },
            onDoneExecuting = { isSaving = false }
        ) { ids ->
            markInserted(item, ids.firstOrNull()?.id)
        }
    }

    fun createSelfTransfer(body: CreateSelfTransferBody) {
        val item = converting ?: return
        makeApiCall(
            call = { api.createSelfTransfer(body) },
            preExecuting = { isSaving = true },
            onDoneExecuting = { isSaving = false }
        ) { ids ->
            markInserted(item, ids.firstOrNull()?.id)
        }
    }

    private fun markInserted(item: SmsNotificationItem, statementId: String?) {
        cancelConverting()
        loadSuggestions()
        setStatus(item, "inserted", statementId, "Added to statements")
    }

    fun junk(item: SmsNotificationItem) = setStatus(item, "junked", null, "Moved to junk")

    fun restore(item: SmsNotificationItem) = setStatus(item, "pending", null, "Moved back to pending")

    private fun setStatus(
        item: SmsNotificationItem,
        status: String,
        statementId: String?,
        message: String
    ) {
        makeApiCall(
            call = { api.updateSmsNotification(item.id, UpdateSmsNotificationBody(status, statementId)) },
            preExecuting = { busyId = item.id },
            onDoneExecuting = { busyId = null }
        ) {
            val updated = item.copy(status = status)
            notifications = if (filter.status == null) {
                notifications.map { if (it.id == item.id) updated else it }
            } else {
                totalCount = (totalCount - 1).coerceAtLeast(0)
                notifications.filterNot { it.id == item.id }
            }
            sendUiEvent(UiEvent.ShowSnackBar(message))
        }
    }
}
