package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.material3.Surface
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.data.entity.StatementItem
import com.jainhardik120.expensetracker.ui.CollectUiEvents
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatementsScreen(viewModel: StatementsViewModel) {
    CollectUiEvents(viewModel)
    val listState = rememberLazyListState()
    var selectedStatement by remember { mutableStateOf<StatementItem?>(null) }
    var showFilters by remember { mutableStateOf(false) }

    selectedStatement?.let { statement ->
        StatementActionsSheet(
            statement = statement,
            onDismiss = { selectedStatement = null },
            onEdit = { viewModel.openEditDialog(statement) },
            onDelete = { viewModel.deleteStatement(statement) }
        )
    }

    val shouldLoadMore = remember {
        derivedStateOf {
            val lastVisibleItem = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val totalItems = listState.layoutInfo.totalItemsCount
            lastVisibleItem >= totalItems - 5 && !viewModel.isLoadingMore && viewModel.hasMorePages
        }
    }

    LaunchedEffect(shouldLoadMore.value) {
        if (shouldLoadMore.value) {
            viewModel.loadMoreStatements()
        }
    }

    val shouldLoadNewer by remember {
        derivedStateOf {
            listState.firstVisibleItemIndex <= 5 && viewModel.hasNewerPages && !viewModel.isLoadingNewer
        }
    }

    LaunchedEffect(shouldLoadNewer) {
        if (shouldLoadNewer) {
            viewModel.loadNewerStatements()
        }
    }

    LaunchedEffect(viewModel) {
        viewModel.scrollRequests.collect { index ->
            listState.scrollToItem(index)
        }
    }

    if (showFilters) {
        StatementFiltersSheet(
            initial = viewModel.filters,
            accounts = viewModel.accounts,
            friends = viewModel.friends,
            categories = viewModel.categories,
            tagSuggestions = viewModel.tags,
            onApply = {
                showFilters = false
                viewModel.applyFilters(it)
            },
            onDismiss = { showFilters = false }
        )
    }

    if (viewModel.showCreateDialog) {
        CreateStatementDialog(
            accounts = viewModel.accounts,
            friends = viewModel.friends,
            categories = viewModel.categories,
            tagSuggestions = viewModel.tags,
            isSaving = viewModel.isSaving,
            onDismiss = { viewModel.closeCreateDialog() },
            onCreateStatement = { viewModel.createStatement(it) },
            onCreateSelfTransfer = { viewModel.createSelfTransfer(it) },
            existing = viewModel.editingStatement,
            onUpdateStatement = { id, body -> viewModel.updateStatement(id, body) },
            onUpdateSelfTransfer = { id, body -> viewModel.updateSelfTransfer(id, body) }
        )
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        floatingActionButton = {
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                FloatingActionButton(
                    onClick = { showFilters = true },
                    containerColor = MaterialTheme.colorScheme.secondaryContainer
                ) {
                    BadgedBox(
                        badge = {
                            val count = viewModel.filters.activeCount
                            if (count > 0) {
                                Badge { Text(count.toString()) }
                            }
                        }
                    ) {
                        Icon(Icons.Default.FilterList, contentDescription = "Filter statements")
                    }
                }
                FloatingActionButton(onClick = { viewModel.openCreateDialog() }) {
                    Icon(Icons.Default.Add, contentDescription = "Add")
                }
            }
        }
    ) { scaffoldPadding ->
        Column(modifier = Modifier
            .fillMaxSize()
            .padding(scaffoldPadding)) {
            if (viewModel.isLoading && viewModel.statements.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (viewModel.errorMessage != null && viewModel.statements.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = viewModel.errorMessage ?: "An error occurred",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        TextButton(onClick = { viewModel.loadStatements() }) {
                            Text("Retry")
                        }
                    }
                }
            } else if (viewModel.statements.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (viewModel.filters.isEmpty) {
                            "No statements found"
                        } else {
                            "No statements match these filters"
                        },
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                Box(modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        start = 16.dp,
                        end = 16.dp,
                        top = 8.dp,
                        bottom = 160.dp
                    )
                ) {
                    items(viewModel.statements, key = { it.id }) { statement ->
                        StatementCard(
                            statement = statement,
                            onLongPress = { selectedStatement = statement }
                        )
                    }
                    if (viewModel.isLoadingMore) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(24.dp))
                            }
                        }
                    } else if (!viewModel.hasMorePages) {
                        item {
                            Text(
                                text = "That's all · ${viewModel.statements.size} statements",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 16.dp)
                            )
                        }
                    }
                }
                DateFastScroller(
                    listState = listState,
                    timeline = viewModel.timeline,
                    firstGlobalIndex = viewModel.firstGlobalIndex,
                    onJump = viewModel::jumpTo,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(top = 8.dp, bottom = 176.dp)
                )
                if (viewModel.isLoading || viewModel.isLoadingNewer) {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .align(Alignment.TopCenter)
                    )
                }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatementActionsSheet(
    statement: StatementItem,
    onDismiss: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    var confirmingDelete by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 24.dp, end = 24.dp, bottom = 32.dp)
        ) {
            Text(
                text = if (statement.type == "self_transfer") {
                    "Self Transfer"
                } else {
                    statement.category ?: "Uncategorized"
                },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "${formatAmount(statement.amount)} · ${formatDate(statement.createdAt)}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            if (confirmingDelete) {
                Text(
                    text = "Delete this statement? This cannot be undone.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { confirmingDelete = false }) { Text("Cancel") }
                    Button(
                        onClick = {
                            onDelete()
                            onDismiss()
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                            contentColor = MaterialTheme.colorScheme.onError
                        )
                    ) { Text("Delete") }
                }
            } else {
                TextButton(
                    onClick = {
                        onEdit()
                        onDismiss()
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Edit, contentDescription = null)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Edit", modifier = Modifier.weight(1f))
                }
                TextButton(
                    onClick = { confirmingDelete = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Delete", modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun StatementCard(statement: StatementItem, onLongPress: () -> Unit = {}) {
    val isSelfTransfer = statement.type == "self_transfer"
    val value = statement.amount.toDoubleOrNull() ?: 0.0
    val isSplit = statement.statementKind == "expense" && statement.splitAmount > 0.0
    val (amountText, amountColor) = when {
        statement.statementKind == "expense" ->
            formatAmount(-(kotlin.math.abs(value) - statement.splitAmount)) to MaterialTheme.colorScheme.error
        isSelfTransfer -> formatAmount(value) to MaterialTheme.colorScheme.onSurface
        value < 0 -> formatAmount(value) to MaterialTheme.colorScheme.error
        else -> formatSignedAmount(value) to MaterialTheme.colorScheme.primary
    }
    val title = if (isSelfTransfer) "Self Transfer" else statement.category ?: "Uncategorized"
    val subtitle = if (isSelfTransfer) {
        "${statement.fromAccount ?: "Unknown"} → ${statement.toAccount ?: "Unknown"}"
    } else {
        buildString {
            statement.accountName?.let { append(it) }
            statement.friendName?.let {
                if (isNotEmpty()) append(" • ")
                append(it)
            }
            if (isSplit) {
                if (isNotEmpty()) append(" • ")
                append("split of ${formatAmount(kotlin.math.abs(value))}")
            }
        }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = {}, onLongClick = onLongPress),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer
        )
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(24.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 160.dp)
                )
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = 8.dp)
                        .clipToBounds(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    statement.tags.forEach { tag -> TagPill(tag) }
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = amountText,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = amountColor,
                    maxLines = 1
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(20.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = formatDate(statement.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun TagPill(tag: String) {
    Surface(
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.secondaryContainer
    ) {
        Text(
            text = tag,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
        )
    }
}

private val outputDateFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.getDefault())
        .withZone(ZoneId.systemDefault())

private fun formatDate(isoDate: String): String {
    return try {
        val instant = Instant.parse(isoDate)
        outputDateFormatter.format(instant)
    } catch (_: Exception) {
        isoDate
    }
}
