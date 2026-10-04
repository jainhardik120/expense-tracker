package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.data.entity.InvestmentCategory
import com.jainhardik120.expensetracker.data.entity.InvestmentHolding
import com.jainhardik120.expensetracker.data.entity.InvestmentsOverview
import com.jainhardik120.expensetracker.data.entity.PortfolioSummary
import com.jainhardik120.expensetracker.ui.theme.Green400
import com.jainhardik120.expensetracker.ui.theme.Green600
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvestmentsScreen(viewModel: InvestmentsViewModel) {
    val overview = viewModel.overview
    PullToRefreshBox(
        isRefreshing = viewModel.isLoading && overview != null,
        onRefresh = { viewModel.loadInvestments() },
        modifier = Modifier.fillMaxSize()
    ) {
        when {
            overview == null && viewModel.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }

            overview == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = viewModel.errorMessage ?: "An error occurred",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        TextButton(onClick = { viewModel.loadInvestments() }) { Text("Retry") }
                    }
                }
            }

            else -> InvestmentsContent(
                overview = overview,
                expandedCategory = viewModel.expandedCategory,
                onCategoryClick = { category -> viewModel.toggleCategory(category) }
            )
        }
    }
}

@Composable
private fun InvestmentsContent(
    overview: InvestmentsOverview,
    expandedCategory: String?,
    onCategoryClick: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        PortfolioCard(overview.summary)

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            MovementCard(
                title = "Total P&L",
                amount = overview.summary.pnl,
                percentage = overview.summary.pnlPercentage,
                modifier = Modifier.weight(1f)
            )
            MovementCard(
                title = "Today",
                amount = overview.summary.dayChange,
                percentage = overview.summary.dayChangePercentage,
                modifier = Modifier.weight(1f)
            )
        }

        if (overview.categories.isNotEmpty()) {
            AllocationCard(
                categories = overview.categories,
                holdings = overview.holdings,
                expandedCategory = expandedCategory,
                onCategoryClick = onCategoryClick
            )
        }

        Spacer(modifier = Modifier.height(8.dp))
    }
}

@Composable
private fun PortfolioCard(summary: PortfolioSummary) {
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
                text = "Portfolio value",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = formatAmount(summary.valuation),
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "${formatAmount(summary.invested)} invested · ${positionsLabel(summary)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
        }
    }
}

@Composable
private fun MovementCard(
    title: String,
    amount: Double,
    percentage: Double?,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = signedAmount(amount),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = movementColour(amount)
            )
            if (percentage != null) {
                Text(
                    text = signedPercentage(percentage),
                    style = MaterialTheme.typography.bodySmall,
                    color = movementColour(amount)
                )
            }
        }
    }
}

@Composable
private fun AllocationCard(
    categories: List<InvestmentCategory>,
    holdings: List<InvestmentHolding>,
    expandedCategory: String?,
    onCategoryClick: (String) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Where it sits",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(4.dp))
            categories.forEach { category ->
                val isExpanded = expandedCategory == category.category
                CategoryRow(
                    category = category,
                    isExpanded = isExpanded,
                    onClick = { onCategoryClick(category.category) }
                )
                if (isExpanded) {
                    val within = holdings.filter { it.category == category.category }
                    if (within.isEmpty()) {
                        Text(
                            text = "Nothing itemised here",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 8.dp, bottom = 8.dp)
                        )
                    } else {
                        within.forEach { holding -> HoldingRow(holding) }
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}

@Composable
private fun CategoryRow(
    category: InvestmentCategory,
    isExpanded: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = category.label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = "${formatAmount(category.invested)} invested",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = formatAmount(category.valuation),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = gainLabel(category.pnl, category.pnlPercentage),
                style = MaterialTheme.typography.bodySmall,
                color = movementColour(category.pnl)
            )
        }
        Icon(
            imageVector = if (isExpanded) {
                Icons.Default.KeyboardArrowUp
            } else {
                Icons.Default.KeyboardArrowDown
            },
            contentDescription = if (isExpanded) "Hide holdings" else "Show holdings",
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 8.dp)
        )
    }
}

@Composable
private fun HoldingRow(holding: InvestmentHolding) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 8.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = holding.name.ifBlank { holding.code },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = holdingSubtitle(holding),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = formatAmount(holding.valuation),
                style = MaterialTheme.typography.bodyMedium
            )
            Text(
                text = gainLabel(holding.pnl, holding.pnlPercentage),
                style = MaterialTheme.typography.bodySmall,
                color = movementColour(holding.pnl)
            )
        }
    }
}

private fun holdingSubtitle(holding: InvestmentHolding): String {
    val units = if (holding.units > 0) "${formatUnits(holding.units)} units · " else ""
    val excluded = if (holding.isExcludedFromPortfolio) " · not in totals" else ""
    return "$units${formatAmount(holding.invested)} invested$excluded"
}

private fun positionsLabel(summary: PortfolioSummary): String {
    val open = summary.openPositions
    val suffix = if (open == 1) "position" else "positions"
    return if (summary.closedPositions == 0) {
        "$open $suffix"
    } else {
        "$open $suffix · ${summary.closedPositions} closed"
    }
}

private fun gainLabel(amount: Double, percentage: Double?): String {
    return if (percentage == null) {
        signedAmount(amount)
    } else {
        "${signedAmount(amount)} (${signedPercentage(percentage)})"
    }
}

@Composable
private fun movementColour(amount: Double): Color {
    if (amount < 0) {
        return MaterialTheme.colorScheme.error
    }
    return if (isSystemInDarkTheme()) Green400 else Green600
}

private fun signedAmount(value: Double): String {
    val formatted = formatAmount(kotlin.math.abs(value))
    return if (value < 0) "-$formatted" else "+$formatted"
}

private fun signedPercentage(value: Double): String {
    return String.format(Locale.getDefault(), "%+.2f%%", value)
}

private fun formatUnits(value: Double): String {
    return if (value == kotlin.math.floor(value)) {
        String.format(Locale.getDefault(), "%.0f", value)
    } else {
        String.format(Locale.getDefault(), "%.4f", value).trimEnd('0').trimEnd('.')
    }
}
