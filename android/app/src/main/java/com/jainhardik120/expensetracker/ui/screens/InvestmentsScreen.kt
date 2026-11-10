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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jainhardik120.expensetracker.data.entity.EpfoSummary
import com.jainhardik120.expensetracker.data.entity.IndividualPosition
import com.jainhardik120.expensetracker.data.entity.InvestmentCategory
import com.jainhardik120.expensetracker.data.entity.InvestmentHolding
import com.jainhardik120.expensetracker.data.entity.EtfEstimate
import com.jainhardik120.expensetracker.data.entity.InvestmentsOverview
import com.jainhardik120.expensetracker.data.entity.MarketItem
import com.jainhardik120.expensetracker.data.entity.TodayEstimate
import com.jainhardik120.expensetracker.ui.theme.Green400
import com.jainhardik120.expensetracker.ui.theme.Green600
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvestmentsScreen(viewModel: InvestmentsViewModel) {
    val overview = viewModel.overview
    BackHandler(enabled = viewModel.selectedCategory != null) { viewModel.selectCategory(null) }
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                delay(MARKET_REFRESH_MS)
                viewModel.refreshLive()
            }
        }
    }
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
                showClosed = viewModel.showClosed,
                todayEstimate = viewModel.todayEstimate,
                etfEstimate = viewModel.etfEstimate,
                isRefreshFailing = viewModel.isRefreshFailing,
                metric = viewModel.metric,
                onSelectCategory = viewModel::selectCategory,
                onToggleClosed = viewModel::toggleClosed,
                onCycleMetric = viewModel::cycleMetric,
                onOpenHolding = viewModel::openChart,
                onOpenAllocation = viewModel::openAllocation,
                onOpenCategory = viewModel::openCategoryTimeline,
                markets = viewModel.markets,
                onOpenMarket = viewModel::openMarketChart
            )
        }
    }
    viewModel.openMarket?.let { item ->
        if (item.key == "gold" || item.key == "silver") {
            MetalChartsSheet(
                item = item,
                charts = viewModel.metalCharts,
                buyPrice = viewModel.metalBuyPrices.firstOrNull { it.code == item.key },
                error = viewModel.marketError,
                range = viewModel.marketRange,
                onSelectRange = viewModel::selectMarketRange,
                onDismiss = viewModel::closeMarketChart
            )
        } else {
            MarketChartSheet(
                item = item,
                points = viewModel.marketPoints,
                previousClose = viewModel.marketPreviousClose,
                components = viewModel.indexComponents,
                error = viewModel.marketError,
                range = viewModel.marketRange,
                onSelectRange = viewModel::selectMarketRange,
                onDismiss = viewModel::closeMarketChart
            )
        }
    }
    if (viewModel.showAllocation) {
        AllocationSheet(
            allocation = viewModel.allocation,
            error = viewModel.allocationError,
            onDismiss = viewModel::closeAllocation
        )
    }
    viewModel.openCategory?.let { category ->
        CategoryTimelineSheet(
            category = category,
            points = viewModel.categoryPoints,
            intraday = viewModel.categoryIntraday,
            error = viewModel.categoryError,
            range = viewModel.categoryRange,
            onSelectRange = viewModel::selectCategoryRange,
            onDismiss = viewModel::closeCategoryTimeline
        )
    }
    viewModel.openHolding?.let { holding ->
        InvestmentChartSheet(
            holding = holding,
            points = viewModel.chartPoints,
            intraday = viewModel.chartIntraday,
            positions = viewModel.chartPositions,
            firstBought = viewModel.chartFirstBought,
            error = viewModel.chartError,
            range = viewModel.chartRange,
            onSelectRange = viewModel::selectRange,
            onDismiss = viewModel::closeChart
        )
    }
}

private const val MARKET_REFRESH_MS = 60_000L
private const val MUTUAL_FUNDS = "mutual_funds"
private const val STOCKS = "stocks"
private val INDIVIDUAL_CATEGORIES = setOf("fd", "epfo")
private const val EPFO = "epfo"
private const val SHORT_YEAR_DIGITS = 100
private val positionDateFormat = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)
private val salaryMonthFormat = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH)
private const val USD_CURRENCY = "USD"
private const val NO_VALUE = "—"
private const val PERCENT = 100.0
private val navDayFormat = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)
private val priceTimeFormat = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)
private val istZone = ZoneId.of("Asia/Kolkata")

private data class EstimatedMove(val amount: Double, val percentage: Double?)

private fun estimateToday(
    holdings: List<InvestmentHolding>,
    percents: Map<String, Double>?,
    base: Double? = null
): EstimatedMove? {
    if (percents == null) {
        return null
    }
    val open = holdings.filter { it.openPositions > 0 }
    val estimated = open.filter { it.code in percents }
    if (estimated.isEmpty()) {
        return null
    }
    val amount = estimated.sumOf { it.valuationInr * (percents[it.code] ?: 0.0) / PERCENT }
    val valuation = base ?: open.sumOf { it.valuationInr }
    return EstimatedMove(amount, if (valuation == 0.0) null else amount / valuation * PERCENT)
}

private fun positionDate(value: String): String =
    runCatching { Instant.parse(value).atZone(istZone).format(positionDateFormat) }.getOrDefault(value)

private fun positionTags(position: IndividualPosition): List<String> = listOfNotNull(
    if (position.isClosed) "Closed" else null,
    istDay(position.salaryPeriodStart, salaryMonthFormat)?.let { "$it salary" },
    position.annualRate?.let { "$it%" },
    position.maturityDate?.takeIf { position.annualRate != null }?.let { "Till ${positionDate(it)}" }
        ?: positionDate(position.date)
)

private fun epfoNote(epfo: EpfoSummary): String? {
    val interest = epfo.interestYears.joinToString(" · ") { year ->
        val nextYear = (year.financialYearStart + 1) % SHORT_YEAR_DIGITS
        val state = if (year.isCredited) "credited" else "estimated"
        "${year.financialYearStart}–$nextYear interest ${wholeRupees(year.amount)} $state"
    }
    val pending = epfo.pending.size.takeIf { it > 0 }?.let { months ->
        val label = if (months == 1) "1 month" else "$months months"
        "$label pending: ${wholeRupees(epfo.pendingAmount)}, " +
            "plus ${wholeRupees(epfo.pendingInterest)} estimated interest"
    }
    return listOfNotNull(pending, interest.ifEmpty { null }).joinToString("\n").ifEmpty { null }
}

private fun istDay(value: String?, format: DateTimeFormatter = navDayFormat): String? =
    value?.let { date -> runCatching { Instant.parse(date).atZone(istZone).format(format) }.getOrNull() }

private fun navDayLabel(estimate: TodayEstimate?): String {
    val day = istDay(estimate?.navDate) ?: return "1D, last NAV"
    val oldest = istDay(estimate?.oldestNavDate) ?: day
    return if (oldest == day) "1D, $day NAV" else "1D, $oldest to $day NAV"
}

private fun estimatedDayLabel(estimate: TodayEstimate?): String {
    val day = istDay(estimate?.estimateDate)
    val today = Instant.now().atZone(istZone).format(navDayFormat)
    return if (day == null || day == today) "Today, estimated" else "$day, estimated"
}

private fun pricesLabel(overview: InvestmentsOverview, marketOpen: Boolean, isFailing: Boolean): String? {
    val moment = overview.pricesAsOf ?: return null
    val day = istDay(moment)
    val time = istDay(moment, priceTimeFormat) ?: return null
    val today = Instant.now().atZone(istZone).format(navDayFormat)
    val shown = if (day == today) time else "$day, $time"
    return when {
        isFailing -> "Couldn't refresh · as of $shown"
        marketOpen && day == today -> "Live · as of $shown"
        else -> "Market closed · as of $shown"
    }
}

private data class Figures(
    val invested: Double,
    val valuation: Double,
    val pnl: Double,
    val pnlPercentage: Double?,
    val realizedPnl: Double,
    val dayChange: Double,
    val dayChangePercentage: Double?,
    val xirr: Double?
)

@Composable
private fun InvestmentsContent(
    overview: InvestmentsOverview,
    selectedCategory: String?,
    showClosed: Boolean,
    todayEstimate: TodayEstimate?,
    etfEstimate: EtfEstimate?,
    isRefreshFailing: Boolean,
    metric: HoldingMetric,
    onSelectCategory: (String?) -> Unit,
    onToggleClosed: () -> Unit,
    onCycleMetric: () -> Unit,
    onOpenHolding: (InvestmentHolding) -> Unit,
    onOpenAllocation: () -> Unit,
    onOpenCategory: (InvestmentCategory) -> Unit,
    markets: List<MarketItem>,
    onOpenMarket: (MarketItem) -> Unit
) {
    val categories = overview.categories.sortedByDescending { it.invested }
    val category = categories.firstOrNull { it.category == selectedCategory }
    val figures = if (category == null) {
        overview.summary.let {
            Figures(
                it.invested, it.valuation, it.pnl, it.pnlPercentage, it.realizedPnl,
                it.dayChange, it.dayChangePercentage, it.xirr
            )
        }
    } else {
        Figures(
            category.invested, category.valuation, category.pnl, category.pnlPercentage, category.realizedPnl,
            category.dayChange, category.dayChangePercentage, category.xirr
        )
    }
    val inCategory = overview.holdings.filter { category == null || it.category == category.category }
    val isIndividual = category?.category in INDIVIDUAL_CATEGORIES
    val individual = overview.positions.filter { it.category == category?.category }
    val hasClosed = if (isIndividual) {
        individual.any { it.isClosed }
    } else {
        category != null && inCategory.any { it.openPositions == 0 }
    }
    val holdings = inCategory.filter { showClosed || it.openPositions > 0 }
    val shownPositions = individual.filter { showClosed || !it.isClosed }.sortedByDescending { it.date }
    val isFunds = category?.category == MUTUAL_FUNDS
    val estimatePercents = when (category?.category) {
        MUTUAL_FUNDS -> todayEstimate?.percents
        STOCKS -> etfEstimate?.percents
        else -> null
    }
    val estimate = if (category == null) {
        estimateToday(
            overview.holdings,
            todayEstimate?.percents.orEmpty() + etfEstimate?.percents.orEmpty(),
            overview.summary.valuation
        )
    } else {
        estimateToday(inCategory, estimatePercents)
    }
    val estimateLabel = when (category?.category) {
        MUTUAL_FUNDS -> estimatedDayLabel(todayEstimate)
        STOCKS -> "After hours, estimated"
        else -> "Estimated change"
    }
    val dayLabel = if (isFunds) navDayLabel(todayEstimate) else "1D returns"
    val openIn = { item: InvestmentCategory ->
        if (item.category in INDIVIDUAL_CATEGORIES) {
            overview.positions.count { it.category == item.category && !it.isClosed }
        } else {
            overview.holdings.count { it.category == item.category && it.openPositions > 0 }
        }
    }
    val rows = if (category == null) {
        categories.map { item ->
            val within = overview.holdings.filter { it.category == item.category && it.openPositions > 0 }
            val count = openIn(item)
            PositionFigures(
                key = item.category,
                title = item.label,
                tags = listOfNotNull(
                    "$count ${if (count == 1) "holding" else "holdings"}",
                    if (within.isNotEmpty() && within.all { it.isExcludedFromPortfolio }) "Not in totals" else null
                ),
                invested = item.invested,
                valuation = item.valuation,
                dayChange = item.dayChange,
                xirr = item.xirr,
                onClick = { onSelectCategory(item.category) }
            )
        }
    } else if (isIndividual) {
        val pendingCredits = if (category?.category == EPFO) overview.epfo.pending else emptyList()
        pendingCredits.map { credit ->
            PositionFigures(
                key = credit.salaryPaymentId,
                title = "${istDay(credit.periodStart, salaryMonthFormat)} salary",
                tags = listOf("Credit pending"),
                invested = credit.expectedAmount,
                valuation = credit.expectedAmount + credit.estimatedInterest,
                dayChange = 0.0,
                xirr = null,
                onClick = null
            )
        } + shownPositions.map { position ->
            PositionFigures(
                key = position.id,
                title = position.name,
                tags = positionTags(position),
                invested = position.invested,
                valuation = position.valuation,
                dayChange = position.dayChange,
                xirr = null,
                onClick = null
            )
        }
    } else {
        holdings.sortedByDescending { it.investedInr }.map { holding ->
            val isUsd = holding.currency == USD_CURRENCY
            PositionFigures(
                key = "${holding.kind}:${holding.code}:${holding.isRsu}",
                title = holding.name.ifBlank { holding.code },
                tags = listOfNotNull(
                    if (holding.openPositions == 0) "Closed" else null,
                    if (holding.isExcludedFromPortfolio) "Not in totals" else null
                ),
                invested = if (isUsd) holding.invested else holding.investedInr,
                valuation = if (isUsd) holding.valuation else holding.valuationInr,
                dayChange = if (isUsd) holding.dayChange else holding.dayChangeInr,
                xirr = holding.xirr,
                onClick = { onOpenHolding(holding) },
                whole = if (isUsd) ::wholeDollars else ::wholeRupees,
                exact = if (isUsd) ::formatDollars else ::formatAmount,
                estimatePercent = estimatePercents?.get(holding.code)
                    ?.takeIf { holding.openPositions > 0 }
            )
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(bottom = 16.dp)
        ) {
            item(key = "header") {
                PortfolioHeader(
                    count = when {
                        category == null -> categories.sumOf(openIn)
                        isIndividual -> shownPositions.size
                        else -> holdings.size
                    },
                    figures = figures,
                    pricesLabel = pricesLabel(overview, todayEstimate?.marketOpen == true, isRefreshFailing),
                    dayLabel = dayLabel,
                    estimate = estimate,
                    estimateLabel = estimateLabel,
                    onClick = if (category == null) onOpenAllocation else { { onOpenCategory(category) } }
                )
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
                    if (hasClosed) {
                        item {
                            FilterChip(
                                selected = showClosed,
                                onClick = onToggleClosed,
                                label = { Text("Closed") }
                            )
                        }
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
            if (category?.category == EPFO) {
                epfoNote(overview.epfo)?.let { note ->
                    item(key = "epfo-note") {
                        Text(
                            text = note,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
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
        if (category == null) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
            MarketTiles(items = markets, onOpen = onOpenMarket)
        }
    }
}

@Composable
private fun PortfolioHeader(
    count: Int,
    figures: Figures,
    pricesLabel: String?,
    dayLabel: String,
    estimate: EstimatedMove?,
    estimateLabel: String,
    onClick: (() -> Unit)?
) {
    Column(
        modifier = Modifier
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
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
        pricesLabel?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        HeaderRow(dayLabel) {
            Text(
                text = gainLabel(figures.dayChange, figures.dayChangePercentage, ::formatAmount),
                color = movementColour(figures.dayChange)
            )
        }
        HeaderRow(estimateLabel) {
            Text(
                text = estimate?.let { gainLabel(it.amount, it.percentage, ::formatAmount) } ?: NO_VALUE,
                color = movementColour(estimate?.amount ?: 0.0)
            )
        }
        HeaderRow("Unrealised returns") {
            Text(
                text = gainLabel(figures.pnl, figures.pnlPercentage, ::wholeRupees),
                color = movementColour(figures.pnl)
            )
        }
        HeaderRow("Realised") {
            Text(
                text = figures.realizedPnl.takeIf { it != 0.0 }?.let { signed(it, ::wholeRupees) } ?: NO_VALUE,
                color = movementColour(figures.realizedPnl)
            )
        }
        HeaderRow("Invested") { Text(text = wholeRupees(figures.invested)) }
        HeaderRow("XIRR") { Text(text = figures.xirr?.let(::plainPercentage) ?: NO_VALUE) }
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
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        ProvideTextStyle(MaterialTheme.typography.bodyMedium) { value() }
    }
}

private val VALUE_COLUMN_WIDTH = 120.dp
private val ESTIMATE_COLUMN_WIDTH = 88.dp
private val ROW_HEIGHT = 80.dp

private data class PositionFigures(
    val key: String,
    val title: String,
    val tags: List<String>,
    val invested: Double,
    val valuation: Double,
    val dayChange: Double,
    val xirr: Double?,
    val onClick: (() -> Unit)?,
    val whole: (Double) -> String = ::wholeRupees,
    val exact: (Double) -> String = ::formatAmount,
    val estimatePercent: Double? = null
) {
    val estimateChange get() = estimatePercent?.let { valuation * it / PERCENT }
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
        row.estimateChange?.let { change ->
            if (metric == HoldingMetric.CURRENT || metric == HoldingMetric.DAY_CHANGE) {
                Column(
                    modifier = Modifier.width(ESTIMATE_COLUMN_WIDTH),
                    horizontalAlignment = Alignment.End
                ) {
                    SecondaryValue("Est.")
                    SecondaryValue(
                        if (metric == HoldingMetric.CURRENT) {
                            row.whole(row.valuation + change)
                        } else {
                            signed(change, row.exact)
                        },
                        movementColour(change)
                    )
                    if (metric == HoldingMetric.DAY_CHANGE) {
                        row.estimatePercent?.let {
                            SecondaryValue("(${signedPercentage(it)})", movementColour(change))
                        }
                    }
                }
            }
        }
        Column(
            modifier = Modifier.width(VALUE_COLUMN_WIDTH),
            horizontalAlignment = Alignment.End
        ) {
            when (metric) {
                HoldingMetric.CURRENT -> {
                    Text(
                        text = row.whole(row.valuation),
                        style = MaterialTheme.typography.bodyLarge,
                        color = movementColour(row.pnl)
                    )
                    SecondaryValue("(${row.whole(row.invested)})")
                }

                HoldingMetric.RETURNS -> {
                    Text(text = signed(row.pnl, row.whole), style = MaterialTheme.typography.bodyLarge)
                    row.pnlPercentage?.let {
                        SecondaryValue("(${signedPercentage(it)})", movementColour(row.pnl))
                    }
                }

                HoldingMetric.DAY_CHANGE -> {
                    Text(text = signed(row.dayChange, row.exact), style = MaterialTheme.typography.bodyLarge)
                    row.dayChangePercentage?.let {
                        SecondaryValue("(${signedPercentage(it)})", movementColour(row.dayChange))
                    }
                }

                HoldingMetric.XIRR -> {
                    Text(
                        text = row.xirr?.let(::plainPercentage) ?: NO_VALUE,
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
