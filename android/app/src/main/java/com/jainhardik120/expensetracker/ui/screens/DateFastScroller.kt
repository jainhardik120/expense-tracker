package com.jainhardik120.expensetracker.ui.screens

import android.view.HapticFeedbackConstants
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.roundToInt

private const val HIDE_DELAY_MS = 1500L
private const val RECENT_BIAS = 4.0

private val biasScale = exp(RECENT_BIAS) - 1

private fun thumbToItem(thumb: Float): Float = ((exp(RECENT_BIAS * thumb) - 1) / biasScale).toFloat()

private fun itemToThumb(item: Float): Float = (ln(1 + item * biasScale) / RECENT_BIAS).toFloat()
private val ThumbHeight = 48.dp
private val TouchWidth = 36.dp

@Composable
fun DateFastScroller(
    listState: LazyListState,
    timeline: StatementTimeline,
    firstGlobalIndex: Int,
    onJump: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val total = timeline.total
    if (timeline.isEmpty || total < 2) return

    val view = LocalView.current
    val density = LocalDensity.current
    var dragging by remember { mutableStateOf(false) }
    var dragFraction by remember { mutableFloatStateOf(0f) }
    var dragDay by remember { mutableIntStateOf(-1) }
    var visible by remember { mutableStateOf(false) }

    val scrolling = listState.isScrollInProgress
    LaunchedEffect(scrolling, dragging) {
        if (scrolling || dragging) {
            visible = true
        } else {
            delay(HIDE_DELAY_MS)
            visible = false
        }
    }

    val listFraction = itemToThumb(
        ((firstGlobalIndex + listState.firstVisibleItemIndex).toFloat() / (total - 1)).coerceIn(0f, 1f)
    )
    val fraction = if (dragging) dragFraction else listFraction
    val currentFraction by rememberUpdatedState(fraction)

    BoxWithConstraints(modifier = modifier) {
        val trackPx = with(density) { (maxHeight - ThumbHeight).toPx() }.coerceAtLeast(1f)
        val thumbHeightPx = with(density) { ThumbHeight.toPx() }

        fun fractionAt(y: Float) = ((y - thumbHeightPx / 2) / trackPx).coerceIn(0f, 1f)

        fun updateDrag(y: Float) {
            dragFraction = fractionAt(y)
            val day = timeline.dayIndexAt((thumbToItem(dragFraction) * (total - 1)).roundToInt())
            if (day != dragDay) {
                dragDay = day
                view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
            }
        }

        if (dragging && dragDay >= 0) {
            Surface(
                shape = RoundedCornerShape(50),
                color = MaterialTheme.colorScheme.primary,
                shadowElevation = 4.dp,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset { IntOffset(0, (dragFraction * trackPx).roundToInt()) }
                    .padding(end = TouchWidth + 8.dp)
            ) {
                Text(
                    text = timeline.label(dragDay),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
                )
            }
        }

        AnimatedVisibility(
            visible = visible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopEnd)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(TouchWidth)
                    .pointerInput(timeline, total, trackPx) {
                        detectVerticalDragGestures(
                            onDragStart = { start ->
                                val thumbTop = currentFraction * trackPx
                                if (start.y in (thumbTop - thumbHeightPx)..(thumbTop + thumbHeightPx * 2)) {
                                    dragging = true
                                    dragDay = -1
                                    updateDrag(start.y)
                                }
                            },
                            onDragEnd = {
                                if (dragging) {
                                    dragging = false
                                    if (dragDay >= 0) onJump(timeline.startOf(dragDay))
                                }
                            },
                            onDragCancel = { dragging = false },
                            onVerticalDrag = { change, _ ->
                                if (dragging) {
                                    change.consume()
                                    updateDrag(change.position.y)
                                }
                            }
                        )
                    }
            ) {
                val thumbWidth by animateDpAsState(if (dragging) 8.dp else 4.dp, label = "thumbWidth")
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset { IntOffset(0, (fraction * trackPx).roundToInt()) }
                        .padding(end = 4.dp)
                        .width(thumbWidth)
                        .height(ThumbHeight)
                        .background(
                            if (dragging) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                            RoundedCornerShape(50)
                        )
                )
            }
        }
    }
}
