package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jainhardik120.expensetracker.data.entity.InstrumentChartPoint
import com.jainhardik120.expensetracker.data.entity.InstrumentPosition
import com.jainhardik120.expensetracker.data.entity.InvestmentHolding
import com.jainhardik120.expensetracker.ui.theme.Green400
import com.jainhardik120.expensetracker.ui.theme.Green600
import java.text.NumberFormat
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

private val chartDateFormat = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvestmentChartSheet(
    holding: InvestmentHolding,
    points: List<InstrumentChartPoint>?,
    positions: List<InstrumentPosition>,
    error: String?,
    range: ChartRange,
    onSelectRange: (ChartRange) -> Unit,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        val unitBased = holding.units > 0
        var selected by remember(points) { mutableStateOf<Int?>(null) }
        val series = points.orEmpty().map { if (unitBased) it.unitPrice else it.holdingValue }
        val shownIndex = selected ?: series.lastIndex.takeIf { it >= 0 }
        val shown = shownIndex?.let(series::getOrNull)
        val base = if (unitBased) {
            series.firstOrNull()
        } else {
            shownIndex?.let { points?.getOrNull(it) }?.investedAmount
        }
        val change = if (shown != null && base != null) shown - base else null
        val changePercent = if (change != null && base != null && base != 0.0) change / abs(base) * 100 else null

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(bottom = 16.dp)
        ) {
            Column(modifier = Modifier.padding(horizontal = 20.dp)) {
                Text(
                    text = holding.name.ifBlank { holding.code },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = if (unitBased) "Price per unit" else "Holding value",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = shown?.let(::sheetRupees) ?: "—",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold
                )
                val dateLabel = selected?.let { points?.getOrNull(it) }?.let { formatChartDate(it.date) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (change != null) {
                        Text(
                            text = buildString {
                                append(sheetSigned(change))
                                changePercent?.let { append(" (%+.2f%%)".format(Locale.getDefault(), it)) }
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = trendColour(change)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                    }
                    Text(
                        text = when {
                            dateLabel != null -> if (unitBased) dateLabel else "returns on $dateLabel"
                            unitBased -> range.sinceLabel()
                            else -> "returns"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp),
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
                        invested = if (unitBased) null else points.map { it.investedAmount },
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
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                ChartRange.entries.forEach { option ->
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

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
            )

            Column(modifier = Modifier.padding(horizontal = 20.dp)) {
                val pnl = holding.valuationInr - holding.investedInr
                StatRow("Current value", sheetRupees(holding.valuationInr))
                StatRow("Invested", sheetRupees(holding.investedInr))
                StatRow(
                    "Total returns",
                    buildString {
                        append(sheetSigned(pnl))
                        if (holding.investedInr != 0.0) {
                            append(" (%+.2f%%)".format(Locale.getDefault(), pnl / abs(holding.investedInr) * 100))
                        }
                    },
                    trendColour(pnl)
                )
                StatRow(
                    "1D returns",
                    buildString {
                        append(sheetSigned(holding.dayChangeInr))
                        val base = holding.valuationInr - holding.dayChangeInr
                        if (base != 0.0) {
                            append(" (%+.2f%%)".format(Locale.getDefault(), holding.dayChangeInr / abs(base) * 100))
                        }
                    },
                    trendColour(holding.dayChangeInr)
                )
                StatRow("XIRR", holding.xirr?.let { "%.2f%%".format(Locale.getDefault(), it) } ?: "—")
                if (unitBased) {
                    StatRow("Units", formatUnits(holding.units))
                }
            }

            if (positions.isNotEmpty()) {
                Text(
                    text = "HOLDINGS (${positions.size})",
                    style = MaterialTheme.typography.labelMedium,
                    letterSpacing = 1.5.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 4.dp)
                )
                positions.forEachIndexed { index, position ->
                    PositionLine(position)
                    if (index < positions.lastIndex) {
                        HorizontalDivider(
                            modifier = Modifier.padding(horizontal = 20.dp),
                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PositionLine(position: InstrumentPosition) {
    val pnl = position.valuationAmount - position.investedAmount
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = formatChartDate(position.date), style = MaterialTheme.typography.bodyLarge)
            val units = position.units?.takeIf { it > 0 }
            val detail = listOfNotNull(
                units?.let { "${formatUnits(it)} units @ ${sheetRupees(position.investedAmount / it)}" },
                if (position.isClosed) {
                    "Closed" + (position.closedAt?.let { " on ${formatChartDate(it)}" } ?: "")
                } else {
                    null
                }
            ).joinToString(" · ")
            if (detail.isNotEmpty()) {
                Text(
                    text = detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = sheetRupees(position.valuationAmount),
                style = MaterialTheme.typography.bodyLarge,
                color = trendColour(pnl)
            )
            Text(
                text = buildString {
                    append("(${sheetRupees(position.investedAmount)})")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
    }
}

@Composable
private fun StatRow(label: String, value: String, colour: Color = MaterialTheme.colorScheme.onSurface) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 7.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f)
        )
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = colour)
    }
}

@Composable
private fun TrendLine(
    series: List<Double>,
    invested: List<Double>?,
    colour: Color,
    selected: Int?,
    onSelect: (Int?) -> Unit
) {
    val guideColour = MaterialTheme.colorScheme.onSurfaceVariant
    val all = series + invested.orEmpty()
    val min = all.min()
    val max = all.max()
    val span = (max - min).takeIf { it > 0 } ?: 1.0

    fun indexAt(x: Float, width: Float): Int =
        (x / width * (series.size - 1)).roundToInt().coerceIn(0, series.lastIndex)

    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(220.dp)
            .padding(vertical = 12.dp)
            .pointerInput(series) {
                detectTapGestures { onSelect(indexAt(it.x, size.width.toFloat())) }
            }
            .pointerInput(series) {
                detectHorizontalDragGestures(
                    onDragEnd = { onSelect(null) },
                    onDragCancel = { onSelect(null) }
                ) { change, _ -> onSelect(indexAt(change.position.x, size.width.toFloat())) }
            }
    ) {
        val step = size.width / (series.size - 1)
        fun yOf(value: Double) = (size.height * (1 - (value - min) / span)).toFloat()
        val points = series.mapIndexed { index, value -> Offset(step * index, yOf(value)) }
        val line = Path().apply {
            moveTo(points.first().x, points.first().y)
            points.drop(1).forEach { lineTo(it.x, it.y) }
        }
        val area = Path().apply {
            addPath(line)
            lineTo(points.last().x, size.height)
            lineTo(points.first().x, size.height)
            close()
        }
        drawPath(
            path = area,
            brush = Brush.verticalGradient(
                colors = listOf(colour.copy(alpha = 0.18f), colour.copy(alpha = 0f)),
                startY = 0f,
                endY = size.height
            )
        )
        invested?.let { values ->
            val path = Path().apply {
                values.forEachIndexed { index, value ->
                    val point = Offset(step * index, yOf(value))
                    if (index == 0) moveTo(point.x, point.y) else lineTo(point.x, point.y)
                }
            }
            drawPath(
                path = path,
                color = guideColour.copy(alpha = 0.6f),
                style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f)))
            )
        }
        drawPath(path = line, color = colour, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round))

        selected?.let(points::getOrNull)?.let { point ->
            drawLine(
                color = guideColour,
                start = Offset(point.x, 0f),
                end = Offset(point.x, size.height),
                strokeWidth = 1f,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f))
            )
            drawCircle(color = colour, radius = 5.dp.toPx(), center = point)
            drawCircle(color = Color.White, radius = 2.dp.toPx(), center = point)
        }
    }
}

@Composable
private fun trendColour(amount: Double): Color = when {
    abs(amount) < 0.005 -> MaterialTheme.colorScheme.onSurface
    amount < 0 -> MaterialTheme.colorScheme.error
    isSystemInDarkTheme() -> Green400
    else -> Green600
}

private fun ChartRange.sinceLabel(): String = when (this) {
    ChartRange.WEEK -> "past week"
    ChartRange.MONTH -> "past month"
    ChartRange.QUARTER -> "past 3 months"
    ChartRange.HALF -> "past 6 months"
    ChartRange.ALL -> "since first buy"
}

private fun formatChartDate(value: String): String =
    runCatching { OffsetDateTime.parse(value).toLocalDate().format(chartDateFormat) }.getOrDefault(value)

private val sheetRupeeFormat: NumberFormat =
    NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN")).apply {
        minimumFractionDigits = 2
        maximumFractionDigits = 2
    }

private fun sheetRupees(value: Double): String = synchronized(sheetRupeeFormat) { sheetRupeeFormat.format(value) }

private fun sheetSigned(value: Double): String {
    val formatted = sheetRupees(abs(value))
    return when {
        abs(value) < 0.005 -> formatted
        value < 0 -> "-$formatted"
        else -> "+$formatted"
    }
}

private fun formatUnits(value: Double): String =
    if (value == kotlin.math.floor(value)) {
        String.format(Locale.getDefault(), "%.0f", value)
    } else {
        String.format(Locale.getDefault(), "%.4f", value).trimEnd('0').trimEnd('.')
    }
