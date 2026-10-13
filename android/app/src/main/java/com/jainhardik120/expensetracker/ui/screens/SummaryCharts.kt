package com.jainhardik120.expensetracker.ui.screens

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jainhardik120.expensetracker.data.entity.CategoryAmount
import com.jainhardik120.expensetracker.data.entity.DayExpense
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

private val CHART_COLORS = listOf(
    Color(0xFFE11D48),
    Color(0xFF3B82F6),
    Color(0xFF10B981),
    Color(0xFFF59E0B),
    Color(0xFF8B5CF6),
    Color(0xFF06B6D4),
    Color(0xFFEC4899),
    Color(0xFF84CC16)
)
private val OTHER_COLOR = Color(0xFF71717A)
private const val MAX_SLICES = 7
private const val Y_GRID_LINES = 3
private const val THOUSAND = 1_000.0
private const val LAKH = 100_000.0
private val DAY_LABEL = DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH)

private fun compactRupees(value: Double): String = when {
    value >= LAKH -> "₹" + String.format(Locale.ENGLISH, "%.1fL", value / LAKH).replace(".0L", "L")
    value >= THOUSAND -> "₹" + String.format(Locale.ENGLISH, "%.1fk", value / THOUSAND).replace(".0k", "k")
    else -> "₹" + value.roundToInt()
}

private fun dailySeries(month: YearMonth, days: List<DayExpense>): List<Pair<LocalDate, Double>> {
    val zone = ZoneId.systemDefault()
    val byDay = days.associate { day ->
        val date = runCatching { Instant.parse(day.date).atZone(zone).toLocalDate() }
            .getOrElse { LocalDate.parse(day.date.take(10)) }
        date to day.expenses
    }
    val today = LocalDate.now(zone)
    val last = if (month == YearMonth.from(today)) today else month.atEndOfMonth()
    return (1..last.dayOfMonth).map { dayOfMonth ->
        val date = month.atDay(dayOfMonth)
        date to (byDay[date] ?: 0.0).coerceAtLeast(0.0)
    }
}

@Composable
private fun ChartCard(title: String, subtitle: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            content()
        }
    }
}

@Composable
fun DailyExpensesChart(month: YearMonth, days: List<DayExpense>) {
    val series = remember(month, days) { dailySeries(month, days) }
    val total = series.sumOf { it.second }
    val peak = series.maxByOrNull { it.second }
    var selected by remember(month, days) { mutableStateOf<Int?>(null) }

    ChartCard(
        title = "Daily spending",
        subtitle = if (total == 0.0) {
            "No spending yet"
        } else {
            "${formatAmount(total)} total · peak ${compactRupees(peak?.second ?: 0.0)} on ${peak?.first?.dayOfMonth}"
        }
    ) {
        val selectedPoint = selected?.let(series::getOrNull)
        Text(
            text = selectedPoint?.let { "${DAY_LABEL.format(it.first)} · ${formatAmount(it.second)}" }
                ?: "Tap or drag on the chart to see a day",
            style = MaterialTheme.typography.labelLarge,
            color = if (selectedPoint == null) {
                MaterialTheme.colorScheme.onSurfaceVariant
            } else {
                MaterialTheme.colorScheme.onSurface
            },
            fontWeight = if (selectedPoint == null) FontWeight.Normal else FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(8.dp))
        LineCanvas(series = series, selected = selected, onSelect = { selected = it })
    }
}

@Composable
private fun LineCanvas(
    series: List<Pair<LocalDate, Double>>,
    selected: Int?,
    onSelect: (Int?) -> Unit
) {
    val lineColor = MaterialTheme.colorScheme.primary
    val gridColor = MaterialTheme.colorScheme.outlineVariant
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant
    val textMeasurer = rememberTextMeasurer()
    val labelStyle = TextStyle(fontSize = 10.sp, color = labelColor)
    val maxValue = (series.maxOfOrNull { it.second } ?: 0.0).coerceAtLeast(1.0)
    val leftGutter = 40.dp
    val bottomGutter = 20.dp

    fun indexAt(x: Float, width: Float, gutter: Float): Int? {
        if (series.isEmpty()) return null
        val plotWidth = width - gutter
        val step = if (series.size > 1) plotWidth / (series.size - 1) else plotWidth
        return ((x - gutter) / step).roundToInt().coerceIn(0, series.lastIndex)
    }

    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp)
            .pointerInput(series) {
                detectTapGestures { offset ->
                    onSelect(indexAt(offset.x, size.width.toFloat(), leftGutter.toPx()))
                }
            }
            .pointerInput(series) {
                detectHorizontalDragGestures { change, _ ->
                    onSelect(indexAt(change.position.x, size.width.toFloat(), leftGutter.toPx()))
                }
            }
    ) {
        val left = leftGutter.toPx()
        val plotHeight = size.height - bottomGutter.toPx()
        val plotWidth = size.width - left
        val step = if (series.size > 1) plotWidth / (series.size - 1) else plotWidth

        for (line in 0..Y_GRID_LINES) {
            val fraction = line.toFloat() / Y_GRID_LINES
            val y = plotHeight * (1 - fraction)
            drawLine(
                color = gridColor,
                start = Offset(left, y),
                end = Offset(size.width, y),
                strokeWidth = 1f,
                pathEffect = if (line == 0) null else PathEffect.dashPathEffect(floatArrayOf(6f, 6f))
            )
            val label = textMeasurer.measure(compactRupees(maxValue * fraction), labelStyle)
            drawText(label, topLeft = Offset(0f, (y - label.size.height / 2f).coerceAtLeast(0f)))
        }

        if (series.isEmpty()) return@Canvas
        val points = series.mapIndexed { index, (_, value) ->
            Offset(left + step * index, plotHeight * (1 - (value / maxValue).toFloat()))
        }
        val line = Path().apply {
            moveTo(points.first().x, points.first().y)
            points.drop(1).forEach { lineTo(it.x, it.y) }
        }
        val area = Path().apply {
            addPath(line)
            lineTo(points.last().x, plotHeight)
            lineTo(points.first().x, plotHeight)
            close()
        }
        drawPath(
            path = area,
            brush = Brush.verticalGradient(
                colors = listOf(lineColor.copy(alpha = 0.35f), lineColor.copy(alpha = 0f)),
                startY = 0f,
                endY = plotHeight
            )
        )
        drawPath(path = line, color = lineColor, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round))

        val labelDays = listOf(0, 7, 14, 21, series.lastIndex).distinct().filter { it <= series.lastIndex }
        labelDays.forEach { index ->
            val text = textMeasurer.measure(series[index].first.dayOfMonth.toString(), labelStyle)
            val x = (points[index].x - text.size.width / 2f).coerceIn(left, size.width - text.size.width)
            drawText(text, topLeft = Offset(x, plotHeight + 4.dp.toPx()))
        }

        selected?.let(points::getOrNull)?.let { point ->
            drawLine(
                color = labelColor,
                start = Offset(point.x, 0f),
                end = Offset(point.x, plotHeight),
                strokeWidth = 1f,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f))
            )
            drawCircle(color = lineColor, radius = 5.dp.toPx(), center = point)
            drawCircle(color = Color.White, radius = 2.dp.toPx(), center = point)
        }
    }
}

@Composable
fun CategoryPieChart(categories: List<CategoryAmount>) {
    val slices = remember(categories) {
        val sorted = categories.filter { it.amount > 0 }.sortedByDescending { it.amount }
        val top = sorted.take(MAX_SLICES).mapIndexed { index, item ->
            Triple(item.category, item.amount, CHART_COLORS[index % CHART_COLORS.size])
        }
        val rest = sorted.drop(MAX_SLICES).sumOf { it.amount }
        if (rest > 0) top + Triple("Other", rest, OTHER_COLOR) else top
    }
    val total = slices.sumOf { it.second }
    var highlighted by remember(categories) { mutableStateOf<String?>(null) }

    ChartCard(
        title = "Where it went",
        subtitle = if (total == 0.0) "No spending yet" else "Your share by category"
    ) {
        if (slices.isEmpty()) {
            Text(
                text = "Nothing to show for this month.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            return@ChartCard
        }
        val focus = slices.firstOrNull { it.first == highlighted }
        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Canvas(modifier = Modifier.size(180.dp)) {
                val thickness = 28.dp.toPx()
                val inset = thickness / 2 + 4.dp.toPx()
                val arcSize = Size(size.width - inset * 2, size.height - inset * 2)
                var start = -90f
                slices.forEach { (name, amount, color) ->
                    val sweep = (amount / total * 360).toFloat()
                    val isFocus = highlighted == null || highlighted == name
                    drawArc(
                        color = if (isFocus) color else color.copy(alpha = 0.25f),
                        startAngle = start + 0.6f,
                        sweepAngle = (sweep - 1.2f).coerceAtLeast(0.5f),
                        useCenter = false,
                        topLeft = Offset(inset, inset),
                        size = arcSize,
                        style = Stroke(width = if (highlighted == name) thickness + 6.dp.toPx() else thickness)
                    )
                    start += sweep
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = focus?.first ?: "Total",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.width(96.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                Text(
                    text = compactRupees(focus?.second ?: total),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            slices.forEach { (name, amount, color) ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { highlighted = if (highlighted == name) null else name }
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(color, CircleShape)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = name,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (highlighted == name) FontWeight.SemiBold else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = "${(amount / total * 100).roundToInt()}%",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = formatAmount(amount),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}
