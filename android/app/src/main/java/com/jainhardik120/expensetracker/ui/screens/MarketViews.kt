package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.data.entity.MarketItem
import com.jainhardik120.expensetracker.data.entity.MarketPoint
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs

private val TILE_WIDTH = 124.dp
private val TILE_HEIGHT = 92.dp
private const val PERCENT = 100.0
private val MARKET_RANGES = listOf(ChartRange.DAY, ChartRange.WEEK, ChartRange.MONTH)

private val marketNumberFormat: NumberFormat =
    NumberFormat.getNumberInstance(Locale.forLanguageTag("en-IN")).apply {
        minimumFractionDigits = 2
        maximumFractionDigits = 2
    }

private fun marketPrice(value: Double, isCurrency: Boolean): String =
    if (isCurrency) {
        formatAmount(value)
    } else {
        synchronized(marketNumberFormat) { marketNumberFormat.format(value) }
    }

private fun signedPercent(value: Double): String = "%+.2f%%".format(Locale.ENGLISH, value)

@Composable
fun MarketTiles(items: List<MarketItem>, onOpen: (MarketItem) -> Unit) {
    if (items.isEmpty()) {
        Spacer(modifier = Modifier.height(TILE_HEIGHT))
        return
    }
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.padding(vertical = 8.dp)
    ) {
        items(items, key = { it.key }) { item ->
            MarketTile(item, Modifier.width(TILE_WIDTH)) { onOpen(item) }
        }
    }
}

@Composable
private fun MarketTile(item: MarketItem, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier = modifier
            .background(
                color = MaterialTheme.colorScheme.surfaceContainer,
                shape = RoundedCornerShape(12.dp)
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Text(
            text = item.label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = item.price?.let { marketPrice(it, item.isCurrency) } ?: "—",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        item.changePercentage?.let {
            Text(
                text = signedPercent(it),
                style = MaterialTheme.typography.labelMedium,
                color = trendColour(it)
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MarketChartSheet(
    item: MarketItem,
    points: List<MarketPoint>?,
    error: String?,
    range: ChartRange,
    onSelectRange: (ChartRange) -> Unit,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        var selected by remember(range) { mutableStateOf<Int?>(null) }
        val series = points.orEmpty().map { it.price }
        val shownIndex = selected ?: series.lastIndex.takeIf { it >= 0 }
        val shown = shownIndex?.let(series::getOrNull)
        val base = series.firstOrNull()
        val change = if (shown != null && base != null) shown - base else null
        val moment = selected?.let { points?.getOrNull(it) }?.let { formatChartMoment(it.date) }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(bottom = 16.dp)
        ) {
            Column(modifier = Modifier.padding(horizontal = 20.dp)) {
                Text(
                    text = item.label,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                item.unit?.let {
                    Text(
                        text = "Per $it",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = (shown ?: item.price)?.let { marketPrice(it, item.isCurrency) } ?: "—",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (change != null && base != null && base != 0.0) {
                        Text(
                            text = "${if (change > 0) "+" else if (change < 0) "-" else ""}" +
                                "${marketPrice(abs(change), item.isCurrency)} " +
                                "(${signedPercent(change / abs(base) * PERCENT)})",
                            style = MaterialTheme.typography.bodyMedium,
                            color = trendColour(change)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                    }
                    Text(
                        text = moment ?: rangeLabel(range),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(240.dp),
                contentAlignment = Alignment.Center
            ) {
                when {
                    error != null -> Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium
                    )

                    points == null -> CircularProgressIndicator(modifier = Modifier.size(28.dp))
                    series.size < 2 -> Text(
                        text = "Not enough history yet",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium
                    )

                    else -> TrendLine(
                        series = series,
                        invested = null,
                        colour = trendColour(series.last() - series.first()),
                        selected = selected,
                        onSelect = { selected = it }
                    )
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                MARKET_RANGES.forEach { option ->
                    val isSelected = option == range
                    Text(
                        text = option.label,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (isSelected) {
                            MaterialTheme.colorScheme.onSurface
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        modifier = Modifier
                            .background(
                                color = if (isSelected) {
                                    MaterialTheme.colorScheme.surfaceContainerHigh
                                } else {
                                    Color.Transparent
                                },
                                shape = RoundedCornerShape(50)
                            )
                            .clickable { onSelectRange(option) }
                            .padding(horizontal = 14.dp, vertical = 6.dp)
                    )
                }
            }
        }
    }
}

private fun rangeLabel(range: ChartRange): String = when (range) {
    ChartRange.DAY -> "today"
    ChartRange.WEEK -> "past week"
    else -> "past month"
}
