package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.data.entity.SmsNotificationItem
import com.jainhardik120.expensetracker.ui.CollectUiEvents
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val smsDateFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a", Locale.ENGLISH)
        .withZone(ZoneId.systemDefault())

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmsNotificationsScreen(viewModel: SmsNotificationsViewModel) {
    CollectUiEvents(viewModel)
    val listState = rememberLazyListState()

    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisible >= listState.layoutInfo.totalItemsCount - 5 && viewModel.hasMorePages
        }
    }

    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) {
            viewModel.loadMore()
        }
    }

    val converting = viewModel.converting
    val prefill = viewModel.prefill
    if (converting != null && prefill != null) {
        CreateStatementDialog(
            accounts = viewModel.accounts,
            friends = viewModel.friends,
            categories = viewModel.categories,
            tagSuggestions = viewModel.tags,
            isSaving = viewModel.isSaving,
            onDismiss = { viewModel.cancelConverting() },
            onCreateStatement = { viewModel.createStatement(it) },
            onCreateSelfTransfer = { viewModel.createSelfTransfer(it) },
            prefill = prefill,
            title = "Add from SMS"
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            SmsFilter.entries.forEach { option ->
                FilterChip(
                    selected = viewModel.filter == option,
                    onClick = { viewModel.selectFilter(option) },
                    label = {
                        Text(
                            if (viewModel.filter == option && !viewModel.isLoading) {
                                "${option.label} · ${viewModel.totalCount}"
                            } else {
                                option.label
                            }
                        )
                    }
                )
            }
        }

        PullToRefreshBox(
            isRefreshing = viewModel.isLoading && viewModel.notifications.isNotEmpty(),
            onRefresh = { viewModel.loadNotifications() },
            modifier = Modifier.fillMaxSize()
        ) {
            when {
                viewModel.isLoading && viewModel.notifications.isEmpty() -> CenteredBox {
                    CircularProgressIndicator()
                }

                viewModel.errorMessage != null && viewModel.notifications.isEmpty() -> CenteredBox {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = viewModel.errorMessage ?: "Something went wrong",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        TextButton(onClick = { viewModel.loadNotifications() }) {
                            Text("Retry")
                        }
                    }
                }

                viewModel.notifications.isEmpty() -> CenteredBox {
                    Text(
                        text = if (viewModel.filter == SmsFilter.Pending) {
                            "You're all caught up"
                        } else {
                            "No messages here"
                        },
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                else -> LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp)
                ) {
                    items(viewModel.notifications, key = { it.id }) { item ->
                        SmsNotificationCard(
                            item = item,
                            showStatus = viewModel.filter == SmsFilter.All,
                            busy = viewModel.busyId == item.id,
                            onAdd = { viewModel.startConverting(item) },
                            onJunk = { viewModel.junk(item) },
                            onRestore = { viewModel.restore(item) }
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

@Composable
private fun CenteredBox(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        content()
    }
}

@Composable
private fun SmsNotificationCard(
    item: SmsNotificationItem,
    showStatus: Boolean,
    busy: Boolean,
    onAdd: () -> Unit,
    onJunk: () -> Unit,
    onRestore: () -> Unit
) {
    var expanded by rememberSaveable(item.id) { mutableStateOf(false) }
    val incoming = item.type == "income"
    val value = item.amount.toDoubleOrNull()

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize()
            .clickable { expanded = !expanded },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item.merchant?.takeIf { it.isNotBlank() } ?: item.sender,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = buildString {
                            append(item.bankName)
                            item.accountLast4?.takeIf { it.isNotBlank() }?.let { append(" ••$it") }
                            append(" · ")
                            append(typeLabel(item.type))
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = when {
                            value == null -> item.amount
                            item.currency != "INR" -> "${item.currency} ${item.amount}"
                            incoming -> formatSignedAmount(value)
                            item.type == "transfer" -> formatAmount(value)
                            else -> formatAmount(-value)
                        },
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = when {
                            incoming -> MaterialTheme.colorScheme.primary
                            item.type == "transfer" -> MaterialTheme.colorScheme.onSurface
                            else -> MaterialTheme.colorScheme.error
                        }
                    )
                    Text(
                        text = formatSmsDate(item.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (showStatus) {
                Spacer(modifier = Modifier.height(8.dp))
                StatusPill(item.status)
            }

            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = item.smsBody,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = if (expanded) Int.MAX_VALUE else 2,
                overflow = TextOverflow.Ellipsis
            )

            if (item.status != "inserted") {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (busy) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    }
                    if (item.status == "pending") {
                        TextButton(onClick = onJunk, enabled = !busy) {
                            Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Junk")
                        }
                        Button(onClick = onAdd, enabled = !busy) {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Add")
                        }
                    } else {
                        TextButton(onClick = onRestore, enabled = !busy) {
                            Icon(Icons.Default.Restore, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Restore")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusPill(status: String) {
    val (label, container, content) = when (status) {
        "inserted" -> Triple(
            "Added",
            MaterialTheme.colorScheme.primaryContainer,
            MaterialTheme.colorScheme.onPrimaryContainer
        )
        "junked" -> Triple(
            "Junked",
            MaterialTheme.colorScheme.errorContainer,
            MaterialTheme.colorScheme.onErrorContainer
        )
        else -> Triple(
            "Pending",
            MaterialTheme.colorScheme.secondaryContainer,
            MaterialTheme.colorScheme.onSecondaryContainer
        )
    }
    Surface(color = container, shape = MaterialTheme.shapes.small) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = content,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
        )
    }
}

private fun typeLabel(type: String): String = when (type) {
    "income" -> "Income"
    "credit" -> "Card"
    "transfer" -> "Transfer"
    "investment" -> "Investment"
    else -> "Expense"
}

private fun formatSmsDate(iso: String): String =
    runCatching { smsDateFormatter.format(Instant.parse(iso)) }.getOrDefault(iso)
