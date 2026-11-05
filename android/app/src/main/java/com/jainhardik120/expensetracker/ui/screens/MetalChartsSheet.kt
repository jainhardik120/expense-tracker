package com.jainhardik120.expensetracker.ui.screens

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jainhardik120.expensetracker.data.entity.MarketItem
import com.jainhardik120.expensetracker.data.entity.MetalBuyPrice
import com.jainhardik120.expensetracker.data.entity.MetalCharts
import com.jainhardik120.expensetracker.data.entity.SeriesPoint
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val PERCENT = 100.0
private const val FULL_COVERAGE = 99.5
private const val SESSION_GAP_MS = 15 * 60_000L
private const val HOUR_MS = 3_600_000L
private const val DAY_TICK_HOURS = 6L
private const val WEEK_TICK_HOURS = 48L
private const val AXIS_PADDING = 0.08
private const val WHOLE_DOLLAR_FROM = 1000.0
private val METAL_RANGES = listOf(ChartRange.DAY, ChartRange.WEEK)
private val lineColour = Color(0xFF2563EB)
private val estimateColour = Color(0xFFF59E0B)
private val istZone = ZoneId.of("Asia/Kolkata")
private val hourFormat = DateTimeFormatter.ofPattern("h a", Locale.ENGLISH)
private val dayFormat = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)
private val momentFormat = DateTimeFormatter.ofPattern("d MMM, h:mm a", Locale.ENGLISH)

private val wholeRupeeAxis: NumberFormat =
    NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN")).apply { maximumFractionDigits = 0 }
private val wholeDollarAxis: NumberFormat =
    NumberFormat.getCurrencyInstance(Locale.US).apply { maximumFractionDigits = 0 }

private fun moment(time: Long): String = Instant.ofEpochMilli(time).atZone(istZone).format(momentFormat)

private fun money(value: Double, isUsd: Boolean): String = if (isUsd) formatDollars(value) else formatAmount(value)

private fun axisMoney(value: Double, isUsd: Boolean): String =
    if (isUsd) {
        if (value < WHOLE_DOLLAR_FROM) {
            formatDollars(value)
        } else {
            synchronized(wholeDollarAxis) { wholeDollarAxis.format(value) }
        }
    } else {
        synchronized(wholeRupeeAxis) { wholeRupeeAxis.format(value) }
    }

private fun signedChange(value: Double): String = "%+.2f%%".format(Locale.ENGLISH, value)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MetalChartsSheet(
    item: MarketItem,
    charts: MetalCharts?,
    buyPrice: MetalBuyPrice?,
    error: String?,
    range: ChartRange,
    onSelectRange: (ChartRange) -> Unit,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        var selectedTime by remember(range) { mutableStateOf<Long?>(null) }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "${item.label.removeSuffix(" MCX")} price movement",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                METAL_RANGES.forEach { option ->
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
            when {
                error != null -> Text(text = error, color = MaterialTheme.colorScheme.error)
                charts == null -> Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(420.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp))
                }

                else -> {
                    if (buyPrice != null) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            BuyFigure(
                                label = "Your average buy, ETF based",
                                average = buyPrice.etf,
                                current = charts.etf.lastOrNull()?.price,
                                unit = charts.unit,
                                modifier = Modifier.weight(1f)
                            )
                            BuyFigure(
                                label = "Your average buy, MCX based" +
                                    if (buyPrice.mcxCoverage < FULL_COVERAGE) {
                                        " · %.0f%% of buys".format(Locale.ENGLISH, buyPrice.mcxCoverage)
                                    } else {
                                        ""
                                    },
                                average = buyPrice.mcx,
                                current = charts.mcx.lastOrNull()?.price,
                                unit = charts.unit,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                    val onSelect: (Long?) -> Unit = { selectedTime = it }
                    SeriesChart(
                        title = "${charts.etfSymbol} ETF, as a rate",
                        unit = charts.unit,
                        points = charts.etf,
                        estimates = charts.etfEstimate,
                        charts = charts,
                        range = range,
                        selectedTime = selectedTime,
                        onSelect = onSelect
                    )
                    SeriesChart(
                        title = "MCX futures",
                        unit = charts.unit,
                        points = charts.mcx,
                        estimates = charts.mcxEstimate,
                        charts = charts,
                        range = range,
                        selectedTime = selectedTime,
                        onSelect = onSelect
                    )
                    SeriesChart(
                        title = "India daily rate",
                        unit = charts.unit,
                        points = charts.india,
                        charts = charts,
                        range = range,
                        selectedTime = selectedTime,
                        onSelect = onSelect,
                        stepped = true
                    )
                    SeriesChart(
                        title = "COMEX, ~10 min delay",
                        unit = "oz",
                        points = charts.comex,
                        charts = charts,
                        range = range,
                        selectedTime = selectedTime,
                        onSelect = onSelect,
                        isUsd = true
                    )
                }
            }
        }
    }
}

@Composable
private fun BuyFigure(
    label: String,
    average: Double?,
    current: Double?,
    unit: String,
    modifier: Modifier
) {
    Column(modifier = modifier) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = average?.let { "${formatAmount(it)} / $unit" } ?: "—",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold
        )
        if (average != null && current != null && average != 0.0) {
            val change = (current / average - 1) * PERCENT
            Text(
                text = "${signedChange(change)} now",
                style = MaterialTheme.typography.labelSmall,
                color = trendColour(change)
            )
        }
    }
}

private fun heading(
    points: List<SeriesPoint>,
    estimates: List<SeriesPoint>,
    unit: String,
    isUsd: Boolean,
    stepped: Boolean,
    selectedTime: Long?
): String {
    val series = (points + estimates).sortedBy { it.time }
    val first = series.firstOrNull() ?: return "No data for this period"
    if (selectedTime != null) {
        val point = series.lastOrNull { it.time <= selectedTime } ?: return "No price yet"
        val estimated = points.none { it.time == point.time }
        val prefix = if (estimated) "Est. " else ""
        return "$prefix${money(point.price, isUsd)} / $unit · ${moment(selectedTime)}"
    }
    val last = series.last()
    val traded = points.lastOrNull()
    val isEstimated = last.time > (traded?.time ?: 0L)
    val prefix = if (isEstimated) "Est. " else ""
    val change = signedChange((last.price / first.price - 1) * PERCENT)
    val tail = if (stepped || traded == null) {
        ""
    } else {
        " · last ${if (isEstimated) "traded" else "move"} ${moment(traded.time)}"
    }
    return "$prefix${money(last.price, isUsd)} / $unit · $change$tail"
}

@Composable
private fun SeriesChart(
    title: String,
    unit: String,
    points: List<SeriesPoint>,
    charts: MetalCharts,
    range: ChartRange,
    selectedTime: Long?,
    onSelect: (Long?) -> Unit,
    estimates: List<SeriesPoint> = emptyList(),
    stepped: Boolean = false,
    isUsd: Boolean = false
) {
    val axisColour = MaterialTheme.colorScheme.onSurfaceVariant
    val gridColour = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)
    val all = points + estimates
    Column {
        Text(text = title, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Medium)
        Text(
            text = heading(points, estimates, unit, isUsd, stepped, selectedTime),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(2.dp))
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(112.dp)
                .pointerInput(charts.start, charts.end) {
                    val left = AXIS_WIDTH.toPx()
                    fun timeAt(x: Float) =
                        charts.start + ((x - left).coerceAtLeast(0f) / (size.width - left).coerceAtLeast(1f) *
                            (charts.end - charts.start)).toLong()
                    detectHorizontalDragGestures(
                        onDragEnd = { onSelect(null) },
                        onDragCancel = { onSelect(null) }
                    ) { change, _ -> onSelect(timeAt(change.position.x)) }
                }
                .pointerInput(charts.start, charts.end) {
                    val left = AXIS_WIDTH.toPx()
                    detectTapGestures { tap ->
                        onSelect(
                            charts.start + ((tap.x - left).coerceAtLeast(0f) / (size.width - left).coerceAtLeast(1f) *
                                (charts.end - charts.start)).toLong()
                        )
                    }
                }
        ) {
            if (all.isEmpty()) {
                return@Canvas
            }
            val low = all.minOf { it.price }
            val high = all.maxOf { it.price }
            val pad = ((high - low) * AXIS_PADDING).coerceAtLeast(high * 0.001)
            val bottomValue = low - pad
            val topValue = high + pad
            val left = AXIS_WIDTH.toPx()
            val bottom = size.height - 14.dp.toPx()
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                textSize = 9.sp.toPx()
                color = axisColour.toArgb()
            }
            fun x(time: Long) = left + (time - charts.start).toFloat() / (charts.end - charts.start).coerceAtLeast(1L) * (size.width - left)
            fun y(price: Double) = (bottom * (1 - (price - bottomValue) / (topValue - bottomValue))).toFloat()
            listOf(topValue, (topValue + bottomValue) / 2, bottomValue).forEach { value ->
                val lineY = y(value).coerceIn(0f, bottom)
                drawLine(gridColour, Offset(left, lineY), Offset(size.width, lineY), strokeWidth = 1f)
                paint.textAlign = Paint.Align.RIGHT
                drawContext.canvas.nativeCanvas.drawText(
                    axisMoney(value, isUsd),
                    left - 4.dp.toPx(),
                    (lineY + 4.dp.toPx()).coerceIn(paint.textSize, bottom),
                    paint
                )
            }
            val step = (if (range == ChartRange.DAY) DAY_TICK_HOURS else WEEK_TICK_HOURS) * HOUR_MS
            var tick = charts.start
            paint.textAlign = Paint.Align.CENTER
            while (tick <= charts.end) {
                val zoned = Instant.ofEpochMilli(tick).atZone(istZone)
                drawContext.canvas.nativeCanvas.drawText(
                    zoned.format(if (range == ChartRange.DAY) hourFormat else dayFormat),
                    x(tick).coerceIn(left + 12.dp.toPx(), size.width - 12.dp.toPx()),
                    size.height - 2.dp.toPx(),
                    paint
                )
                tick += step
            }
            drawSeries(points, lineColour, stepped, ::x, ::y, dashed = false)
            drawSeries(estimates, estimateColour, stepped = false, ::x, ::y, dashed = true)
            selectedTime?.let {
                val lineX = x(it)
                drawLine(axisColour, Offset(lineX, 0f), Offset(lineX, bottom), strokeWidth = 1.dp.toPx())
            }
        }
    }
}

private val AXIS_WIDTH = 52.dp

private fun DrawScope.drawSeries(
    points: List<SeriesPoint>,
    colour: Color,
    stepped: Boolean,
    x: (Long) -> Float,
    y: (Double) -> Float,
    dashed: Boolean
) {
    if (points.isEmpty()) {
        return
    }
    val path = Path()
    points.forEachIndexed { index, point ->
        val previous = points.getOrNull(index - 1)
        when {
            previous == null -> path.moveTo(x(point.time), y(point.price))
            stepped -> {
                path.lineTo(x(point.time), y(previous.price))
                path.lineTo(x(point.time), y(point.price))
            }

            point.time - previous.time > SESSION_GAP_MS -> path.moveTo(x(point.time), y(point.price))
            else -> path.lineTo(x(point.time), y(point.price))
        }
    }
    drawPath(
        path = path,
        color = colour,
        style = Stroke(
            width = 1.5.dp.toPx(),
            pathEffect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(10f, 8f)) else null
        )
    )
}
