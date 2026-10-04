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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.data.entity.AccountSummary
import com.jainhardik120.expensetracker.data.entity.FriendSummary
import com.jainhardik120.expensetracker.data.entity.SummaryResponse
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

private val MONTH_LABEL = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.getDefault())

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SummaryScreen(viewModel: SummaryViewModel) {
    val summary = viewModel.summary
    PullToRefreshBox(
        isRefreshing = viewModel.isLoading && summary != null,
        onRefresh = { viewModel.loadSummary() },
        modifier = Modifier.fillMaxSize()
    ) {
        when {
            summary == null && viewModel.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }

            summary == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = viewModel.errorMessage ?: "An error occurred",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        TextButton(onClick = { viewModel.loadSummary() }) { Text("Retry") }
                    }
                }
            }

            else -> SummaryContent(
                summary = summary,
                month = viewModel.month,
                isCurrentMonth = viewModel.isCurrentMonth,
                isLoading = viewModel.isLoading,
                onPreviousMonth = { viewModel.showPreviousMonth() },
                onNextMonth = { viewModel.showNextMonth() }
            )
        }
    }
}

@Composable
private fun SummaryContent(
    summary: SummaryResponse,
    month: YearMonth,
    isCurrentMonth: Boolean,
    isLoading: Boolean,
    onPreviousMonth: () -> Unit,
    onNextMonth: () -> Unit
) {
    val accounts = summary.aggregatedAccountsSummaryData
    val friends = summary.aggregatedFriendsSummaryData

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        BalanceCard(
            balance = accounts.finalBalance - friends.finalBalance,
            inAccounts = accounts.finalBalance,
            withFriends = friends.finalBalance,
            isCurrentMonth = isCurrentMonth,
            month = month
        )

        MonthSelector(
            month = month,
            canGoForward = !isCurrentMonth,
            isLoading = isLoading,
            onPreviousMonth = onPreviousMonth,
            onNextMonth = onNextMonth
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainer
            )
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "This month",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(12.dp))
                val friendsShare = summary.myExpensesTotal - accounts.expenses
                AmountRow("Your spending", -summary.myExpensesTotal)
                if (friendsShare != 0.0) {
                    AmountRow(
                        if (friendsShare < 0) "Paid for friends" else "Paid by friends",
                        friendsShare
                    )
                }
                AmountRow("Money in", accounts.outsideTransactions)
                AmountRow("Settled with friends", accounts.friendTransactions)
                if (accounts.selfTransfers != 0.0) {
                    AmountRow("Between accounts", accounts.selfTransfers)
                }
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                AmountRow("Net change", accounts.totalTransfers, bold = true, coloured = true)
            }
        }

        if (summary.accountsSummaryData.isNotEmpty()) {
            BalanceListCard(
                title = "Accounts",
                entries = summary.accountsSummaryData.map(::accountEntry)
            )
        }

        if (summary.friendsSummaryData.isNotEmpty()) {
            BalanceListCard(
                title = "Friends",
                entries = summary.friendsSummaryData.map(::friendEntry)
            )
        }

        Spacer(modifier = Modifier.height(8.dp))
    }
}

@Composable
private fun BalanceCard(
    balance: Double,
    inAccounts: Double,
    withFriends: Double,
    isCurrentMonth: Boolean,
    month: YearMonth
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = if (isCurrentMonth) "Current balance" else "Balance at end of ${month.format(MONTH_LABEL)}",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = formatAmount(balance),
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "${formatAmount(inAccounts)} in accounts · ${formatAmount(withFriends)} with friends",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
        }
    }
}

@Composable
private fun MonthSelector(
    month: YearMonth,
    canGoForward: Boolean,
    isLoading: Boolean,
    onPreviousMonth: () -> Unit,
    onNextMonth: () -> Unit
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onPreviousMonth) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Previous month")
            }
            Text(
                text = month.format(MONTH_LABEL),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            IconButton(onClick = onNextMonth, enabled = canGoForward) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Next month")
            }
        }
        if (isLoading) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
    }
}

private data class BalanceEntry(val name: String, val balance: Double)

private fun accountEntry(summary: AccountSummary) =
    BalanceEntry(summary.account.accountName, summary.finalBalance)

private fun friendEntry(summary: FriendSummary) =
    BalanceEntry(summary.friend.name, summary.finalBalance)

@Composable
private fun BalanceListCard(title: String, entries: List<BalanceEntry>) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
            entries.forEach { entry ->
                AmountRow(entry.name, entry.balance, coloured = true)
            }
        }
    }
}

@Composable
private fun AmountRow(
    label: String,
    value: Double,
    bold: Boolean = false,
    coloured: Boolean = false
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal
        )
        Text(
            text = formatAmount(value),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Medium,
            color = if (coloured && value < 0) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.onSurface
            }
        )
    }
}
