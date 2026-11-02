package com.jainhardik120.expensetracker.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jainhardik120.expensetracker.data.entity.InvestmentHolding
import com.jainhardik120.expensetracker.data.entity.InvestmentsOverview
import com.jainhardik120.expensetracker.ui.theme.Green400
import com.jainhardik120.expensetracker.ui.theme.Green600
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvestmentsScreen(viewModel: InvestmentsViewModel) {
    val overview = viewModel.overview
    BackHandler(enabled = viewModel.selectedCategory != null) { viewModel.selectCategory(null) }
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
                selectedCategory = viewModel.selectedCategory,
                metric = viewModel.metric,
                onSelectCategory = viewModel::selectCategory,
                onCycleMetric = viewModel::cycleMetric,
                onOpenHolding = viewModel::openChart
            )
        }
    }
    viewModel.openHolding?.let { holding ->
        InvestmentChartSheet(
            holding = holding,
            points = viewModel.chartPoints,
            positions = viewModel.chartPositions,
            error = viewModel.chartError,
            range = viewModel.chartRange,
            onSelectRange = viewModel::selectRange,
            onDismiss = viewModel::closeChart
        )
    }
}

private data class Figures(
    val invested: Double,
    val valuation: Double,
    val pnl: Double,
    val pnlPercentage: Double?,
    val dayChange: Double,
    val dayChangePercentage: Double?,
    val xirr: Double?
)

@Composable
private fun InvestmentsContent(
    overview: InvestmentsOverview,
    selectedCategory: String?,
    metric: HoldingMetric,
    onSelectCategory: (String?) -> Unit,
    onCycleMetric: () -> Unit,
    onOpenHolding: (InvestmentHolding) -> Unit
) {
    val categories = overview.categories.sortedByDescending { it.invested }
    val category = categories.firstOrNull { it.category == selectedCategory }
    val figures = if (category == null) {
        overview.summary.let {
            Figures(it.invested, it.valuation, it.pnl, it.pnlPercentage, it.dayChange, it.dayChangePercentage, it.xirr)
        }
    } else {
        Figures(
            category.invested, category.valuation, category.pnl, category.pnlPercentage,
            category.dayChange, category.dayChangePercentage, category.xirr
        )
    }
    val holdings = overview.holdings.filter { category == null || it.category == category.category }
    val rows = if (category == null) {
        categories.map { item ->
            val within = overview.holdings.filter { it.category == item.category }
            PositionFigures(
                key = item.category,
                title = item.label,
                tags = listOfNotNull(
                    "${within.size} ${if (within.size == 1) "holding" else "holdings"}",
                    if (within.isNotEmpty() && within.all { it.isExcludedFromPortfolio }) "Not in totals" else null
                ),
                invested = item.invested,
                valuation = item.valuation,
                dayChange = item.dayChange,
                xirr = item.xirr,
                onClick = { onSelectCategory(item.category) }
            )
        }
    } else {
        holdings.sortedByDescending { it.investedInr }.map { holding ->
            PositionFigures(
                key = "${holding.kind}:${holding.code}:${holding.isRsu}",
                title = holding.name.ifBlank { holding.code },
                tags = listOfNotNull(
                    if (holding.isExcludedFromPortfolio) "Not in totals" else null
                ),
                invested = holding.investedInr,
                valuation = holding.valuationInr,
                dayChange = holding.dayChangeInr,
                xirr = holding.xirr,
                onClick = { onOpenHolding(holding) }
            )
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        item(key = "header") {
            PortfolioHeader(count = holdings.size, figures = figures)
        }
        item(key = "chips") {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(top = 4.dp)
            ) {
                item {
                    FilterChip(
                        selected = category == null,
                        onClick = { onSelectCategory(null) },
                        label = { Text("All") }
                    )
                }
                items(categories, key = { it.category }) { item ->
                    FilterChip(
                        selected = category?.category == item.category,
                        onClick = { onSelectCategory(item.category) },
                        label = { Text(item.label) }
                    )
                }
            }
        }
        item(key = "metric") {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, end = 8.dp, top = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "By invested amount",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f)
                )
                Row(
                    modifier = Modifier
                        .clickable(onClick = onCycleMetric)
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.UnfoldMore,
                        contentDescription = null,
                        modifier = Modifier
                            .size(16.dp)
                            .rotate(90f)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = metric.label,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
        if (rows.isEmpty()) {
            item(key = "empty") {
                Text(
                    text = "Nothing itemised here",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp)
                )
            }
        }
        items(rows, key = { it.key }) { row ->
            PositionRow(row = row, metric = metric)
            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
            )
        }
    }
}

@Composable
private fun PortfolioHeader(count: Int, figures: Figures) {
    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(
            text = "HOLDINGS ($count)",
            style = MaterialTheme.typography.labelMedium,
            letterSpacing = 1.5.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = wholeRupees(figures.valuation),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(12.dp))
        HeaderRow("1D returns") {
            Text(
                text = gainLabel(figures.dayChange, figures.dayChangePercentage, ::formatAmount),
                color = movementColour(figures.dayChange)
            )
        }
        HeaderRow("Total returns") {
            Text(
                text = gainLabel(figures.pnl, figures.pnlPercentage, ::wholeRupees),
                color = movementColour(figures.pnl)
            )
        }
        HeaderRow("Invested") { Text(text = wholeRupees(figures.invested)) }
        HeaderRow("XIRR") { Text(text = figures.xirr?.let(::plainPercentage) ?: "—") }
    }
}

@Composable
private fun HeaderRow(label: String, value: @Composable () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f)
        )
        ProvideTextStyle(MaterialTheme.typography.bodyMedium) { value() }
    }
}

private val VALUE_COLUMN_WIDTH = 120.dp
private val ROW_HEIGHT = 80.dp

private data class PositionFigures(
    val key: String,
    val title: String,
    val tags: List<String>,
    val invested: Double,
    val valuation: Double,
    val dayChange: Double,
    val xirr: Double?,
    val onClick: (() -> Unit)?
) {
    val pnl get() = valuation - invested
    val pnlPercentage get() = if (invested == 0.0) null else pnl / abs(invested) * 100
    val dayChangePercentage get() = (valuation - dayChange).let { if (it == 0.0) null else dayChange / abs(it) * 100 }
}

@Composable
private fun PositionRow(row: PositionFigures, metric: HoldingMetric) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(ROW_HEIGHT)
            .then(if (row.onClick != null) Modifier.clickable(onClick = row.onClick) else Modifier)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = row.title,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = if (row.tags.isEmpty()) 2 else 1,
                overflow = TextOverflow.Ellipsis
            )
            if (row.tags.isNotEmpty()) {
                Row(
                    modifier = Modifier.padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    row.tags.forEach { Tag(it) }
                }
            }
        }
        Spacer(modifier = Modifier.width(16.dp))
        Column(
            modifier = Modifier.width(VALUE_COLUMN_WIDTH),
            horizontalAlignment = Alignment.End
        ) {
            when (metric) {
                HoldingMetric.CURRENT -> {
                    Text(
                        text = wholeRupees(row.valuation),
                        style = MaterialTheme.typography.bodyLarge,
                        color = movementColour(row.pnl)
                    )
                    SecondaryValue("(${wholeRupees(row.invested)})")
                }

                HoldingMetric.RETURNS -> {
                    Text(text = signed(row.pnl, ::wholeRupees), style = MaterialTheme.typography.bodyLarge)
                    row.pnlPercentage?.let {
                        SecondaryValue("(${signedPercentage(it)})", movementColour(row.pnl))
                    }
                }

                HoldingMetric.DAY_CHANGE -> {
                    Text(text = signed(row.dayChange, ::formatAmount), style = MaterialTheme.typography.bodyLarge)
                    row.dayChangePercentage?.let {
                        SecondaryValue("(${signedPercentage(it)})", movementColour(row.dayChange))
                    }
                }

                HoldingMetric.XIRR -> {
                    Text(
                        text = row.xirr?.let(::plainPercentage) ?: "—",
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            }
        }
    }
}

@Composable
private fun SecondaryValue(text: String, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = color,
        modifier = Modifier.padding(top = 2.dp)
    )
}

@Composable
private fun Tag(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .background(
                color = MaterialTheme.colorScheme.surfaceContainerHigh,
                shape = RoundedCornerShape(6.dp)
            )
            .padding(horizontal = 8.dp, vertical = 3.dp)
    )
}

@Composable
private fun movementColour(amount: Double): Color {
    if (amount < 0) {
        return MaterialTheme.colorScheme.error
    }
    if (abs(amount) < 0.005) {
        return MaterialTheme.colorScheme.onSurface
    }
    return if (isSystemInDarkTheme()) Green400 else Green600
}

private val wholeRupeeFormat: NumberFormat =
    NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN")).apply {
        minimumFractionDigits = 0
        maximumFractionDigits = 0
    }

private fun wholeRupees(value: Double): String = synchronized(wholeRupeeFormat) { wholeRupeeFormat.format(value) }

private fun signed(value: Double, format: (Double) -> String): String {
    val formatted = format(abs(value))
    return when {
        abs(value) < 0.005 -> formatted
        value < 0 -> "-$formatted"
        else -> "+$formatted"
    }
}

private fun gainLabel(amount: Double, percentage: Double?, format: (Double) -> String): String {
    val value = signed(amount, format)
    return if (percentage == null) value else "$value (${signedPercentage(percentage)})"
}

private fun signedPercentage(value: Double): String =
    String.format(Locale.getDefault(), "%+.2f%%", value)

private fun plainPercentage(value: Double): String =
    String.format(Locale.getDefault(), "%.2f%%", value)
