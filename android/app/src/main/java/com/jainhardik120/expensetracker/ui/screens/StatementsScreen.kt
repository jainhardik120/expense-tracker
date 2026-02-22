package com.jainhardik120.expensetracker.ui.screens

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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.remember
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

@Composable
fun StatementsScreen(viewModel: StatementsViewModel) {
    val listState = rememberLazyListState()

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

    Column(modifier = Modifier.fillMaxSize()) {
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
                    StatementCard(statement)
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

@Composable
fun StatementCard(statement: StatementItem) {
    Card(
        modifier = Modifier.fillMaxWidth(),
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
