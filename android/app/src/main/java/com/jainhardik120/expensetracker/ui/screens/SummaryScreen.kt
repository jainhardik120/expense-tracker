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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.data.entity.AccountSummary
import com.jainhardik120.expensetracker.data.entity.FriendSummary
import com.jainhardik120.expensetracker.data.entity.SummaryResponse
import java.util.Locale

@Composable
fun SummaryScreen(viewModel: SummaryViewModel) {
    when {
        viewModel.isLoading && viewModel.summary == null -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
        viewModel.errorMessage != null && viewModel.summary == null -> {
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
                    TextButton(onClick = { viewModel.loadSummary() }) {
                        Text("Retry")
                    }
                }
            }
        }
        else -> {
            viewModel.summary?.let { summary ->
                SummaryContent(summary = summary, onRefresh = { viewModel.loadSummary() })
            }
        }
    }
}

@Composable
fun SummaryContent(summary: SummaryResponse, onRefresh: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer
            )
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Total Expenses",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "₹${formatSummaryAmount(summary.myExpensesTotal)}",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }

        val aggAccounts = summary.aggregatedAccountsSummaryData
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainer
            )
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Accounts Overview",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(12.dp))
                SummaryRow("Expenses", aggAccounts.expenses)
                SummaryRow("Self Transfers", aggAccounts.selfTransfers)
                SummaryRow("Outside Transactions", aggAccounts.outsideTransactions)
                SummaryRow("Friend Transactions", aggAccounts.friendTransactions)
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                SummaryRow("Total Transfers", aggAccounts.totalTransfers, bold = true)
            }
        }

        if (summary.accountsSummaryData.isNotEmpty()) {
            Text(
                text = "Accounts",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
            summary.accountsSummaryData.forEach { accountSummary ->
                AccountSummaryCard(accountSummary)
            }
        }

        if (summary.friendsSummaryData.isNotEmpty()) {
            Text(
                text = "Friends",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
            summary.friendsSummaryData.forEach { friendSummary ->
                FriendSummaryCard(friendSummary)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))
    }
}

@Composable
fun AccountSummaryCard(accountSummary: AccountSummary) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = accountSummary.account.accountName,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
            SummaryRow("Balance", accountSummary.finalBalance)
            SummaryRow("Expenses", accountSummary.expenses)
            SummaryRow("Transfers", accountSummary.totalTransfers)
        }
    }
}

@Composable
fun FriendSummaryCard(friendSummary: FriendSummary) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = friendSummary.friend.name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
            SummaryRow("Balance", friendSummary.finalBalance)
            SummaryRow("Paid by Friend", friendSummary.paidByFriend)
            SummaryRow("Splits", friendSummary.splits)
        }
    }
}

@Composable
fun SummaryRow(label: String, value: Double, bold: Boolean = false) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal
        )
        Text(
            text = "₹${formatSummaryAmount(value)}",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal
        )
    }
}

private fun formatSummaryAmount(value: Double): String {
    return if (value == value.toLong().toDouble()) {
        value.toLong().toString()
    } else {
        String.format(Locale.getDefault(), "%.2f", value)
    }
}
