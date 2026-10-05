package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.jainhardik120.expensetracker.data.entity.AccountItem
import com.jainhardik120.expensetracker.data.entity.CreateSelfTransferBody
import com.jainhardik120.expensetracker.data.entity.CreateStatementBody
import com.jainhardik120.expensetracker.data.entity.FriendItem
import com.jainhardik120.expensetracker.data.entity.BulkSplitBody
import com.jainhardik120.expensetracker.data.entity.BulkSplitFields
import com.jainhardik120.expensetracker.data.entity.SplitFields
import com.jainhardik120.expensetracker.data.entity.SplitItem
import com.jainhardik120.expensetracker.data.entity.StatementFilters
import com.jainhardik120.expensetracker.data.entity.StatementItem
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.ui.BaseViewModel
import com.jainhardik120.expensetracker.ui.UiEvent
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import java.time.ZoneId
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

    var isLoadingNewer by mutableStateOf(false)
        private set

    var hasMorePages by mutableStateOf(true)
        private set

    var firstPage by mutableIntStateOf(1)
        private set

    private var lastPage = 1
    private var pageCount = 1
    val perPage = 30

    val hasNewerPages: Boolean get() = firstPage > 1

    val firstGlobalIndex: Int get() = (firstPage - 1) * perPage

    var totalCount by mutableIntStateOf(0)
        private set

    var timeline by mutableStateOf(StatementTimeline.EMPTY)
        private set

    private val _scrollRequests = Channel<Int>(Channel.CONFLATED)
    val scrollRequests = _scrollRequests.receiveAsFlow()

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

    var filters by mutableStateOf(StatementFilters())
        private set

    var showCreateDialog by mutableStateOf(false)
        private set

    var editingStatement by mutableStateOf<StatementItem?>(null)
        private set

    var isSaving by mutableStateOf(false)
        private set

    init {
        loadStatements()
        loadAccounts()
        loadFriends()
        loadSuggestions()
    }

    fun applyFilters(value: StatementFilters) {
        if (value == filters) return
        filters = value
        selectedIds = emptySet()
        statements = emptyList()
        loadStatements()
    }

    fun loadStatements() {
        val requestedFilters = filters
        firstPage = 1
        lastPage = 1
        hasMorePages = true
        errorMessage = null
        makeApiCall(
            call = { api.getStatements(page = 1, perPage = perPage, filters = requestedFilters) },
            preExecuting = { isLoading = true },
            onDoneExecuting = { isLoading = false },
            onException = { msg ->
                errorMessage = msg
            }
        ) { response ->
            if (requestedFilters != filters) return@makeApiCall
            statements = response.statements
            updatePaging(response.pageCount, response.rowsCount.statementCount + response.rowsCount.selfTransferStatementCount)
        }
        loadTimeline()
    }

    private fun loadTimeline() {
        val requestedFilters = filters
        makeApiCall(
            call = { api.getStatementTimeline(requestedFilters, ZoneId.systemDefault().id) },
            preExecuting = null,
            onDoneExecuting = null,
            onException = { timeline = StatementTimeline.EMPTY }
        ) { days ->
            if (requestedFilters != filters) return@makeApiCall
            timeline = StatementTimeline(days)
        }
    }

    private fun updatePaging(count: Int, total: Int) {
        pageCount = count
        totalCount = total
        hasMorePages = lastPage < pageCount
    }

    fun loadMoreStatements() {
        if (isLoading || isLoadingMore || !hasMorePages) return
        val requestedFilters = filters
        val nextPage = lastPage + 1
        makeApiCall(
            call = { api.getStatements(page = nextPage, perPage = perPage, filters = requestedFilters) },
            preExecuting = { isLoadingMore = true },
            onDoneExecuting = { isLoadingMore = false },
            onException = { msg ->
                errorMessage = msg
            }
        ) { response ->
            if (requestedFilters != filters || nextPage != lastPage + 1) return@makeApiCall
            val known = statements.mapTo(HashSet()) { it.id }
            statements = statements + response.statements.filterNot { it.id in known }
            lastPage = nextPage
            updatePaging(response.pageCount, response.rowsCount.statementCount + response.rowsCount.selfTransferStatementCount)
        }
    }

    fun loadNewerStatements() {
        if (isLoading || isLoadingNewer || !hasNewerPages) return
        val requestedFilters = filters
        val previousPage = firstPage - 1
        makeApiCall(
            call = { api.getStatements(page = previousPage, perPage = perPage, filters = requestedFilters) },
            preExecuting = { isLoadingNewer = true },
            onDoneExecuting = { isLoadingNewer = false },
            onException = { msg ->
                errorMessage = msg
            }
        ) { response ->
            if (requestedFilters != filters || previousPage != firstPage - 1) return@makeApiCall
            val known = statements.mapTo(HashSet()) { it.id }
            statements = response.statements.filterNot { it.id in known } + statements
            firstPage = previousPage
            updatePaging(response.pageCount, response.rowsCount.statementCount + response.rowsCount.selfTransferStatementCount)
        }
    }

    fun jumpTo(globalIndex: Int) {
        if (isLoading) return
        val requestedFilters = filters
        val page = globalIndex / perPage + 1
        val loadedRange = firstGlobalIndex until firstGlobalIndex + statements.size
        if (globalIndex in loadedRange) {
            _scrollRequests.trySend(globalIndex - firstGlobalIndex)
            return
        }
        makeApiCall(
            call = { api.getStatements(page = page, perPage = perPage, filters = requestedFilters) },
            preExecuting = { isLoading = true },
            onDoneExecuting = { isLoading = false },
            onException = { msg ->
                errorMessage = msg
            }
        ) { response ->
            if (requestedFilters != filters) return@makeApiCall
            statements = response.statements
            firstPage = page
            lastPage = page
            updatePaging(response.pageCount, response.rowsCount.statementCount + response.rowsCount.selfTransferStatementCount)
            _scrollRequests.trySend((globalIndex - (page - 1) * perPage).coerceIn(0, (statements.size - 1).coerceAtLeast(0)))
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

    private fun loadSuggestions() {
        makeApiCall(call = { api.getCategories() }) { response ->
            categories = response
        }
        makeApiCall(call = { api.getTags() }) { response ->
            tags = response
        }
    }

    private fun onSaved() {
        closeCreateDialog()
        loadStatements()
        loadSuggestions()
    }

    fun openCreateDialog() {
        editingStatement = null
        showCreateDialog = true
    }

    fun openEditDialog(item: StatementItem) {
        editingStatement = item
        showCreateDialog = true
    }

    fun closeCreateDialog() {
        showCreateDialog = false
        editingStatement = null
    }

    fun createStatement(body: CreateStatementBody) {
        makeApiCall(
            call = { api.createStatement(body) },
            preExecuting = { isSaving = true },
            onDoneExecuting = { isSaving = false }
        ) {
            onSaved()
        }
    }

    fun createSelfTransfer(body: CreateSelfTransferBody) {
        makeApiCall(
            call = { api.createSelfTransfer(body) },
            preExecuting = { isSaving = true },
            onDoneExecuting = { isSaving = false }
        ) {
            onSaved()
        }
    }

    fun updateStatement(id: String, body: CreateStatementBody) {
        makeApiCall(
            call = { api.updateStatement(id, body) },
            preExecuting = { isSaving = true },
            onDoneExecuting = { isSaving = false }
        ) {
            onSaved()
        }
    }

    fun updateSelfTransfer(id: String, body: CreateSelfTransferBody) {
        makeApiCall(
            call = { api.updateSelfTransfer(id, body) },
            preExecuting = { isSaving = true },
            onDoneExecuting = { isSaving = false }
        ) {
            onSaved()
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
            totalCount = (totalCount - 1).coerceAtLeast(0)
            loadTimeline()
        }
    }

    var splitsFor by mutableStateOf<StatementItem?>(null)
        private set

    var splits by mutableStateOf<List<SplitItem>>(emptyList())
        private set

    var isLoadingSplits by mutableStateOf(false)
        private set

    var isSavingSplit by mutableStateOf(false)
        private set

    fun openSplits(item: StatementItem) {
        splitsFor = item
        splits = emptyList()
        loadSplits(item.id)
    }

    fun closeSplits() {
        splitsFor = null
        splits = emptyList()
    }

    private fun loadSplits(statementId: String) {
        makeApiCall(
            call = { api.getSplits(statementId) },
            preExecuting = { isLoadingSplits = true },
            onDoneExecuting = { isLoadingSplits = false }
        ) { response ->
            if (splitsFor?.id != statementId) return@makeApiCall
            splits = response
            val total = response.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
            statements = statements.map { if (it.id == statementId) it.copy(splitAmount = total) else it }
            splitsFor = splitsFor?.copy(splitAmount = total)
        }
    }

    fun saveSplit(splitId: String?, friendId: String, amount: String, onDone: () -> Unit) {
        val statementId = splitsFor?.id ?: return
        val fields = SplitFields(friendId = friendId, amount = amount)
        makeApiCall(
            call = {
                if (splitId == null) {
                    api.createSplit(statementId, fields)
                } else {
                    api.updateSplit(splitId, fields)
                }
            },
            preExecuting = { isSavingSplit = true },
            onDoneExecuting = { isSavingSplit = false }
        ) {
            onDone()
            loadSplits(statementId)
            sendUiEvent(UiEvent.ShowSnackBar(if (splitId == null) "Split added" else "Split updated"))
        }
    }

    fun deleteSplit(splitId: String) {
        val statementId = splitsFor?.id ?: return
        makeApiCall(
            call = { api.deleteSplit(splitId) },
            preExecuting = { isSavingSplit = true },
            onDoneExecuting = { isSavingSplit = false }
        ) {
            loadSplits(statementId)
            sendUiEvent(UiEvent.ShowSnackBar("Split deleted"))
        }
    }

    var selectedIds by mutableStateOf<Set<String>>(emptySet())
        private set

    val isSelecting: Boolean get() = selectedIds.isNotEmpty()

    val selectedStatements: List<StatementItem>
        get() = statements.filter { it.id in selectedIds }

    fun toggleSelection(item: StatementItem) {
        selectedIds = if (item.id in selectedIds) selectedIds - item.id else selectedIds + item.id
    }

    private fun refreshSplitTotal(statementId: String) {
        makeApiCall(call = { api.getSplits(statementId) }, preExecuting = null, onDoneExecuting = null) { response ->
            val total = response.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
            statements = statements.map { if (it.id == statementId) it.copy(splitAmount = total) else it }
        }
    }

    fun clearSelection() {
        selectedIds = emptySet()
    }

    var bulkSplitError by mutableStateOf<String?>(null)
        private set

    fun clearBulkSplitError() {
        bulkSplitError = null
    }

    fun bulkSplit(friendId: String, percentage: String, onDone: () -> Unit) {
        val targets = selectedStatements
        if (targets.isEmpty()) return
        makeApiCall(
            call = {
                api.bulkSplit(
                    BulkSplitBody(
                        statementIds = targets.map { it.id },
                        bulkSplitSchema = BulkSplitFields(friendId = friendId, percentage = percentage)
                    )
                )
            },
            preExecuting = {
                isSavingSplit = true
                bulkSplitError = null
            },
            onDoneExecuting = { isSavingSplit = false },
            onException = { bulkSplitError = it },
            onError = { bulkSplitError = it.message }
        ) {
            val ids = targets.map { it.id }.toSet()
            ids.forEach(::refreshSplitTotal)
            clearSelection()
            onDone()
            sendUiEvent(UiEvent.ShowSnackBar(if (ids.size == 1) "Split 1 statement" else "Split ${ids.size} statements"))
        }
    }
}
