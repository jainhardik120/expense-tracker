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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jainhardik120.expensetracker.data.entity.InstrumentChartPoint
import com.jainhardik120.expensetracker.data.entity.InstrumentPosition
import com.jainhardik120.expensetracker.data.entity.InvestmentHolding
import com.jainhardik120.expensetracker.ui.theme.Green400
import com.jainhardik120.expensetracker.ui.theme.Green600
import java.text.NumberFormat
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

private val chartDateFormat = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)
private val chartMomentFormat = DateTimeFormatter.ofPattern("d MMM, h:mm a", Locale.ENGLISH)
private val chartZone = ZoneId.of("Asia/Kolkata")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvestmentChartSheet(
    holding: InvestmentHolding,
    points: List<InstrumentChartPoint>?,
    intraday: Boolean,
    positions: List<InstrumentPosition>,
    firstBought: String?,
    error: String?,
    range: ChartRange,
    onSelectRange: (ChartRange) -> Unit,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        val unitBased = holding.kind in UNIT_PRICED_KINDS
        var selected by remember(range) { mutableStateOf<Int?>(null) }
        val isUsd = holding.currency == "USD"
        val isFund = holding.kind == "mutual_funds"
        val money: (Double) -> String = if (isUsd) ::formatDollars else ::sheetRupees
        val series = points.orEmpty().map {
            when {
                isUsd -> it.unitPriceDisplay ?: it.unitPrice
                unitBased -> it.unitPrice
                else -> it.holdingValue
            }
        }
        val shownIndex = selected ?: series.lastIndex.takeIf { it >= 0 }
        val shown = shownIndex?.let(series::getOrNull)
        val base = if (unitBased) {
            series.firstOrNull()
        } else {
            shownIndex?.let { points?.getOrNull(it) }?.investedAmount
        }
        val change = if (shown != null && base != null) shown - base else null
        val changePercent = if (change != null && base != null && base != 0.0) change / abs(base) * 100 else null
        val firstBoughtIndex = firstBought?.let { bought ->
            points?.indexOfFirst { it.date >= bought }?.takeIf { it > 0 }
        }
        val shortHistoryStart = points?.firstOrNull()?.date?.takeIf { startsAfterRange(it, range) }

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
                    text = shown?.let(money) ?: "—",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold
                )
                if (isUsd) {
                    shownIndex?.let { points?.getOrNull(it) }?.let { point ->
                        Text(
                            text = sheetRupees(point.unitPrice),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                val dateLabel = selected?.let { points?.getOrNull(it) }?.let {
                    if (intraday && !isFund) formatChartMoment(it.date) else formatChartDate(it.date)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (change != null) {
                        Text(
                            text = buildString {
                                append(sheetSigned(change, money))
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
                            unitBased -> shortHistoryStart?.let { "since ${formatChartDate(it)}" }
                                ?: range.sinceLabel(isFund)
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
                        onSelect = { selected = it },
                        marker = firstBoughtIndex
                    )
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                HOLDING_RANGES.forEach { option ->
                    val isSelected = option == range
                    Text(
                        text = option.label,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                        textAlign = TextAlign.Center,
                        color = if (isSelected) {
                            MaterialTheme.colorScheme.onSurface
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        modifier = Modifier
                            .weight(1f)
                            .background(
                                color = if (isSelected) {
                                    MaterialTheme.colorScheme.surfaceContainerHigh
                                } else {
                                    Color.Transparent
                                },
                                shape = RoundedCornerShape(50)
                            )
                            .clickable { onSelectRange(option) }
                            .padding(vertical = 6.dp)
                    )
                }
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
            )

            Column(modifier = Modifier.padding(horizontal = 20.dp)) {
                val value = if (isUsd) holding.valuation else holding.valuationInr
                val invested = if (isUsd) holding.invested else holding.investedInr
                val dayChange = if (isUsd) holding.dayChange else holding.dayChangeInr
                val pnl = value - invested
                val pnlInr = holding.valuationInr - holding.investedInr
                StatRow(
                    "Current value",
                    money(value),
                    secondary = if (isUsd) sheetRupees(holding.valuationInr) else null
                )
                StatRow(
                    "Invested",
                    money(invested),
                    secondary = if (isUsd) sheetRupees(holding.investedInr) else null
                )
                StatRow(
                    if (holding.openPositions == 0) "Realised returns" else "Unrealised returns",
                    buildString {
                        append(sheetSigned(pnl, money))
                        if (invested != 0.0) {
                            append(" (%+.2f%%)".format(Locale.getDefault(), pnl / abs(invested) * 100))
                        }
                    },
                    trendColour(pnl),
                    secondary = if (isUsd) sheetSigned(pnlInr) else null
                )
                StatRow(
                    if (isFund) "Last NAV change" else "1D returns",
                    buildString {
                        append(sheetSigned(dayChange, money))
                        val base = value - dayChange
                        if (base != 0.0) {
                            append(" (%+.2f%%)".format(Locale.getDefault(), dayChange / abs(base) * 100))
                        }
                    },
                    trendColour(dayChange),
                    secondary = if (isUsd) sheetSigned(holding.dayChangeInr) else null
                )
                StatRow("XIRR", holding.xirr?.let { "%.2f%%".format(Locale.getDefault(), it) } ?: "—")
                if (holding.units > 0) {
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
                    PositionLine(position, isUsd)
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
private fun PositionLine(position: InstrumentPosition, isUsd: Boolean) {
    val valuation = if (isUsd) position.valuationDisplay ?: position.valuationAmount else position.valuationAmount
    val invested = if (isUsd) position.investedDisplay ?: position.investedAmount else position.investedAmount
    val money: (Double) -> String = if (isUsd) ::formatDollars else ::sheetRupees
    val pnl = valuation - invested
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
                units?.let { "${formatUnits(it)} units @ ${money(invested / it)}" },
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
                text = money(valuation),
                style = MaterialTheme.typography.bodyLarge,
                color = trendColour(pnl)
            )
            Text(
                text = buildString {
                    append("(${money(invested)})")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
    }
}

@Composable
private fun StatRow(
    label: String,
    value: String,
    colour: Color = MaterialTheme.colorScheme.onSurface,
    secondary: String? = null
) {
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
        Column(horizontalAlignment = Alignment.End) {
            Text(text = value, style = MaterialTheme.typography.bodyMedium, color = colour)
            if (secondary != null) {
                Text(
                    text = secondary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
internal fun TrendLine(
    series: List<Double>,
    invested: List<Double>?,
    colour: Color,
    selected: Int?,
    onSelect: (Int?) -> Unit,
    marker: Int? = null
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
        marker?.let(points::getOrNull)?.let { point ->
            drawLine(
                color = guideColour.copy(alpha = 0.6f),
                start = Offset(point.x, 0f),
                end = Offset(point.x, size.height),
                strokeWidth = 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f))
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
internal fun trendColour(amount: Double): Color = when {
    abs(amount) < 0.005 -> MaterialTheme.colorScheme.onSurface
    amount < 0 -> MaterialTheme.colorScheme.error
    isSystemInDarkTheme() -> Green400
    else -> Green600
}

private val UNIT_PRICED_KINDS = setOf("stocks", "mutual_funds", "crypto", "commodities")
private const val RANGE_START_SLACK_DAYS = 7L
private val HOLDING_RANGES = ChartRange.entries - ChartRange.WEEK

private fun ChartRange.sinceLabel(isFund: Boolean): String = when (this) {
    ChartRange.DAY -> if (isFund) "last NAV change" else "1D"
    ChartRange.WEEK -> "past week"
    ChartRange.MONTH -> "past month"
    ChartRange.HALF -> "past 6 months"
    ChartRange.YEAR -> "past year"
    ChartRange.THREE_YEARS -> "past 3 years"
    ChartRange.FIVE_YEARS -> "past 5 years"
}

private fun startsAfterRange(date: String, range: ChartRange): Boolean =
    runCatching {
        OffsetDateTime.parse(date).isAfter(OffsetDateTime.now().minusDays(range.days - RANGE_START_SLACK_DAYS))
    }.getOrDefault(false)

internal fun formatChartMoment(value: String): String =
    runCatching {
        OffsetDateTime.parse(value).atZoneSameInstant(chartZone).format(chartMomentFormat)
    }.getOrDefault(value)

private fun formatChartDate(value: String): String =
    runCatching {
        OffsetDateTime.parse(value).atZoneSameInstant(chartZone).format(chartDateFormat)
    }.getOrDefault(value)

private val sheetRupeeFormat: NumberFormat =
    NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN")).apply {
        minimumFractionDigits = 2
        maximumFractionDigits = 2
    }

private fun sheetRupees(value: Double): String = synchronized(sheetRupeeFormat) { sheetRupeeFormat.format(value) }

private fun sheetSigned(value: Double, money: (Double) -> String = ::sheetRupees): String {
    val formatted = money(abs(value))
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
