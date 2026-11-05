package com.jainhardik120.expensetracker.ui.screens

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jainhardik120.expensetracker.data.entity.AllocationGroup
import com.jainhardik120.expensetracker.data.entity.AllocationSlice
import com.jainhardik120.expensetracker.data.entity.AllocationView
import com.jainhardik120.expensetracker.ui.theme.Green400
import com.jainhardik120.expensetracker.ui.theme.Green600
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

private const val FULL_TURN = 360f
private const val TOP_ANGLE = -90f
private const val HOLE = 0.16f
private const val KINDS_EDGE = 0.30f
private const val MARKET_EDGE = 0.44f
private const val OUTER_EDGE = 0.58f
private const val PERCENT = 100.0

private val otherColour = Color(0xFFA1A1AA)
private val sliceColours = mapOf(
    "market" to Color(0xFF2563EB),
    "gold" to Color(0xFFF59E0B),
    "silver" to Color(0xFF0891B2),
    "fd" to Color(0xFF7C3AED),
    "crypto" to Color(0xFF059669),
    "epfo" to Color(0xFFEA580C),
    "other" to otherColour,
    "mutual_funds" to Color(0xFF4338CA),
    "stocks" to Color(0xFF22D3EE),
    "Large cap" to Color(0xFF1E40AF),
    "Mid cap" to Color(0xFF3B82F6),
    "Small cap" to Color(0xFF93C5FD),
    "International" to Color(0xFF818CF8),
    "Debt" to Color(0xFF64748B),
    "Cash" to Color(0xFF94A3B8),
    "Real estate" to Color(0xFFC4B5FD),
    "Other" to otherColour
)

private val holdingsMonthFormat = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH)

private fun colourOf(slice: AllocationSlice) = sliceColours[slice.colorKey] ?: otherColour

private fun expand(groups: List<AllocationGroup>, level: (AllocationGroup) -> List<AllocationSlice>) =
    groups.flatMap { group -> level(group).ifEmpty { listOf(group.slice) } }

private fun holdingsNote(view: AllocationView): String {
    val month = view.holdingsDate?.let {
        runCatching {
            Instant.parse(it).atZone(ZoneId.of("Asia/Kolkata")).format(holdingsMonthFormat)
        }.getOrNull()
    }
    val suffix = if (month == null) "" else " ($month)"
    return "Funds and ETFs are split by their latest published holdings$suffix, " +
        "so their invested and day change figures are estimates."
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AllocationSheet(
    allocation: AllocationView?,
    error: String?,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        var selected by remember { mutableStateOf<AllocationSlice?>(null) }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(bottom = 16.dp)
        ) {
            Text(
                text = "Asset allocation",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 20.dp)
            )
            Spacer(modifier = Modifier.height(8.dp))
            when {
                error != null -> Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(20.dp)
                )

                allocation == null -> Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(300.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp))
                }

                else -> {
                    AllocationRings(
                        groups = allocation.groups,
                        onSelect = { selected = it }
                    )
                    SelectedFigures(selected)
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                    )
                    allocation.groups.forEach { group ->
                        BreakdownRow(group.slice, nested = false) { selected = group.slice }
                        if (group.kinds.isNotEmpty()) {
                            SectionLabel("By type")
                            group.kinds.forEach { slice ->
                                BreakdownRow(slice, nested = true) { selected = slice }
                            }
                        }
                        if (group.buckets.isNotEmpty()) {
                            SectionLabel("By size")
                            group.buckets.forEach { slice ->
                                BreakdownRow(slice, nested = true) { selected = slice }
                            }
                        }
                    }
                    Text(
                        text = holdingsNote(allocation),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 12.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun AllocationRings(groups: List<AllocationGroup>, onSelect: (AllocationSlice) -> Unit) {
    val middle = groups.map { it.slice }
    val inner = expand(groups) { it.kinds }
    val outer = expand(groups) { it.buckets }
    val nameColour = MaterialTheme.colorScheme.onSurface
    val shareColour = MaterialTheme.colorScheme.onSurfaceVariant
    val lineColour = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(300.dp)
            .pointerInput(groups) {
                detectTapGestures { tap ->
                    val maxRadius = min(size.width, size.height) / 2f
                    val dx = tap.x - size.width / 2f
                    val dy = tap.y - size.height / 2f
                    val distance = sqrt(dx * dx + dy * dy) / maxRadius
                    val ring = when {
                        distance < HOLE || distance > OUTER_EDGE -> null
                        distance < KINDS_EDGE -> inner
                        distance < MARKET_EDGE -> middle
                        else -> outer
                    }
                    if (ring != null) {
                        val angle = (Math.toDegrees(atan2(dy, dx).toDouble()).toFloat() - TOP_ANGLE + FULL_TURN) % FULL_TURN
                        sliceAt(ring, angle)?.let(onSelect)
                    }
                }
            }
    ) {
        val maxRadius = min(size.width, size.height) / 2f
        val overlap = 1.dp.toPx()
        drawRing(outer, maxRadius * MARKET_EDGE, maxRadius * OUTER_EDGE)
        drawRing(middle, maxRadius * KINDS_EDGE, maxRadius * MARKET_EDGE + overlap)
        drawRing(inner, maxRadius * HOLE, maxRadius * KINDS_EDGE + overlap)
        drawLabels(outer, maxRadius * OUTER_EDGE, nameColour, shareColour, lineColour)
    }
}

private fun sliceAt(ring: List<AllocationSlice>, angle: Float): AllocationSlice? {
    val total = ring.sumOf { it.value }
    if (total <= 0) {
        return null
    }
    var passed = 0f
    return ring.firstOrNull { slice ->
        passed += (slice.value / total).toFloat() * FULL_TURN
        angle <= passed
    }
}

private fun DrawScope.drawRing(ring: List<AllocationSlice>, from: Float, to: Float) {
    val total = ring.sumOf { it.value }
    if (total <= 0) {
        return
    }
    val centre = Offset(size.width / 2f, size.height / 2f)
    val radius = (from + to) / 2f
    var start = TOP_ANGLE
    ring.forEach { slice ->
        val sweep = (slice.value / total).toFloat() * FULL_TURN
        drawArc(
            color = colourOf(slice),
            startAngle = start,
            sweepAngle = sweep,
            useCenter = false,
            topLeft = Offset(centre.x - radius, centre.y - radius),
            size = Size(radius * 2f, radius * 2f),
            style = Stroke(width = to - from)
        )
        start += sweep
    }
}

private class LabelPosition(
    val slice: AllocationSlice,
    val anchor: Offset,
    val elbow: Offset,
    val isRight: Boolean,
    var y: Float
)

private fun spreadRows(rows: List<LabelPosition>, top: Float, bottom: Float, height: Float) {
    val sorted = rows.sortedBy { it.y }
    var next = top
    sorted.forEach { row ->
        row.y = max(row.y, next)
        next = row.y + height
    }
    var limit = bottom
    sorted.reversed().forEach { row ->
        row.y = min(row.y, limit)
        limit = row.y - height
    }
}

private fun DrawScope.drawLabels(
    ring: List<AllocationSlice>,
    radius: Float,
    nameColour: Color,
    shareColour: Color,
    lineColour: Color
) {
    val total = ring.sumOf { it.value }
    if (total <= 0) {
        return
    }
    val gap = 12.dp.toPx()
    val rowHeight = 26.dp.toPx()
    val centre = Offset(size.width / 2f, size.height / 2f)
    val elbowRadius = radius + gap / 2f
    var passed = 0.0
    val labels = ring.map { slice ->
        val middle = (passed + slice.value / 2) / total
        passed += slice.value
        val angle = (middle * 2 * PI - PI / 2).toFloat()
        val elbow = Offset(centre.x + elbowRadius * cos(angle), centre.y + elbowRadius * sin(angle))
        LabelPosition(
            slice = slice,
            anchor = Offset(centre.x + radius * cos(angle), centre.y + radius * sin(angle)),
            elbow = elbow,
            isRight = cos(angle) >= 0,
            y = elbow.y
        )
    }
    listOf(true, false).forEach { side ->
        spreadRows(labels.filter { it.isRight == side }, rowHeight / 2f, size.height - rowHeight / 2f, rowHeight)
    }
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 11.sp.toPx() }
    labels.forEach { label ->
        val x = if (label.isRight) centre.x + radius + gap else centre.x - radius - gap
        val end = Offset(x, label.y)
        drawLine(lineColour, label.anchor, label.elbow, strokeWidth = 1.dp.toPx())
        drawLine(lineColour, label.elbow, end, strokeWidth = 1.dp.toPx())
        val textX = x + if (label.isRight) 3.dp.toPx() else -3.dp.toPx()
        paint.textAlign = if (label.isRight) Paint.Align.LEFT else Paint.Align.RIGHT
        paint.color = nameColour.toArgb()
        paint.isFakeBoldText = false
        drawContext.canvas.nativeCanvas.drawText(label.slice.label, textX, label.y - 2.dp.toPx(), paint)
        paint.color = shareColour.toArgb()
        paint.isFakeBoldText = true
        drawContext.canvas.nativeCanvas.drawText(
            "%.1f%%".format(Locale.ENGLISH, label.slice.share),
            textX,
            label.y + 10.dp.toPx(),
            paint
        )
    }
}

@Composable
private fun moveColour(amount: Double): Color = when {
    abs(amount) < 0.005 -> MaterialTheme.colorScheme.onSurfaceVariant
    amount < 0 -> MaterialTheme.colorScheme.error
    isSystemInDarkTheme() -> Green400
    else -> Green600
}

private fun signedAmount(value: Double): String {
    val formatted = formatAmount(abs(value))
    return when {
        abs(value) < 0.005 -> formatted
        value < 0 -> "-$formatted"
        else -> "+$formatted"
    }
}

private fun withPercent(value: Double, base: Double): String =
    if (base == 0.0) {
        signedAmount(value)
    } else {
        "${signedAmount(value)} (%+.2f%%)".format(Locale.ENGLISH, value / abs(base) * PERCENT)
    }

@Composable
private fun SelectedFigures(slice: AllocationSlice?) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        if (slice == null) {
            Text(
                text = "Tap a slice or a row to see its figures",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            val pnl = slice.value - slice.invested
            Row(verticalAlignment = Alignment.CenterVertically) {
                Swatch(colourOf(slice))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = slice.label,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = "%.1f%%".format(Locale.ENGLISH, slice.share),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            FigureRow("Current value", formatAmount(slice.value))
            FigureRow("Invested", formatAmount(slice.invested))
            FigureRow("Profit/loss", withPercent(pnl, slice.invested), moveColour(pnl))
            FigureRow(
                "Day change",
                withPercent(slice.dayChange, slice.value - slice.dayChange),
                moveColour(slice.dayChange)
            )
        }
    }
}

@Composable
private fun FigureRow(label: String, value: String, colour: Color = MaterialTheme.colorScheme.onSurface) {
    Row {
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
private fun Swatch(colour: Color) {
    Box(
        modifier = Modifier
            .size(10.dp)
            .background(colour, RoundedCornerShape(2.dp))
    )
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 36.dp, top = 6.dp, bottom = 2.dp)
    )
}

@Composable
private fun BreakdownRow(slice: AllocationSlice, nested: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(start = if (nested) 36.dp else 20.dp, end = 20.dp, top = 7.dp, bottom = 7.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Swatch(colourOf(slice))
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = slice.label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (nested) FontWeight.Normal else FontWeight.Medium,
            modifier = Modifier.weight(1f)
        )
        Text(
            text = "${formatAmount(slice.value)} · %.1f%%".format(Locale.ENGLISH, slice.share),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
