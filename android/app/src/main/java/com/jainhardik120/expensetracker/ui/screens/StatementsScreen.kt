package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.data.entity.StatementItem
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatementsScreen(viewModel: StatementsViewModel) {
    val listState = rememberLazyListState()
    var selectedStatement by remember { mutableStateOf<StatementItem?>(null) }

    selectedStatement?.let { statement ->
        StatementActionsSheet(
            statement = statement,
            onDismiss = { selectedStatement = null },
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

    if (viewModel.showCreateDialog) {
        CreateStatementDialog(
            accounts = viewModel.accounts,
            friends = viewModel.friends,
            isSaving = viewModel.isSaving,
            onDismiss = { viewModel.closeCreateDialog() },
            onCreateStatement = { viewModel.createStatement(it) },
            onCreateSelfTransfer = { viewModel.createSelfTransfer(it) }
        )
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { viewModel.openCreateDialog() }) {
                Icon(Icons.Default.Add, contentDescription = "Add")
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
                        text = "No statements found",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        horizontal = 16.dp,
                        vertical = 8.dp
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
                    }
                }
            }
        }
    }
}

/**
 * What you can do to a statement, on long press.
 *
 * Deleting used to be a left swipe, which is far too easy to do by accident
 * while scrolling — and it deleted immediately, with nothing to undo it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatementActionsSheet(
    statement: StatementItem,
    onDismiss: () -> Unit,
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
                text = "₹${formatAmount(statement.amount)} · ${formatDate(statement.createdAt)}",
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
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = {}, onLongClick = onLongPress),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    if (statement.type == "self_transfer") {
                        Text(
                            text = "Self Transfer",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Medium
                        )
                        val from = statement.fromAccount ?: "Unknown"
                        val to = statement.toAccount ?: "Unknown"
                        Text(
                            text = "$from → $to",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    } else {
                        Text(
                            text = statement.category ?: "Uncategorized",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Medium
                        )
                        val subtitle = buildString {
                            statement.accountName?.let { append(it) }
                            statement.friendName?.let {
                                if (isNotEmpty()) append(" • ")
                                append(it)
                            }
                        }
                        if (subtitle.isNotEmpty()) {
                            Text(
                                text = subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(horizontalAlignment = Alignment.End) {
                    val amountColor = when (statement.statementKind) {
                        "expense" -> MaterialTheme.colorScheme.error
                        "outside_transaction", "friend_transaction" -> MaterialTheme.colorScheme.primary
                        else -> MaterialTheme.colorScheme.onSurface
                    }
                    val prefix = when (statement.statementKind) {
                        "expense" -> "-"
                        "outside_transaction", "friend_transaction" -> "+"
                        else -> ""
                    }
                    Text(
                        text = "${prefix}₹${formatAmount(statement.amount)}",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = amountColor
                    )
                    Text(
                        text = formatDate(statement.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            if (statement.tags.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    statement.tags.take(3).forEach { tag ->
                        androidx.compose.material3.AssistChip(
                            onClick = {},
                            label = {
                                Text(
                                    text = tag,
                                    style = MaterialTheme.typography.labelSmall
                                )
                            },
                            modifier = Modifier.height(24.dp)
                        )
                    }
                }
            }
        }
    }
}

private fun formatAmount(amount: String): String {
    return try {
        val value = amount.toDouble()
        if (value == value.toLong().toDouble()) {
            value.toLong().toString()
        } else {
            String.format(Locale.getDefault(), "%.2f", value)
        }
    } catch (_: NumberFormatException) {
        amount
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
