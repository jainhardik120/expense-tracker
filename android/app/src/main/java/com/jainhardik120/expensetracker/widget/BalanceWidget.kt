package com.jainhardik120.expensetracker.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.action.actionStartActivity
import com.jainhardik120.expensetracker.MainActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.compose.ui.graphics.Color
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val Rose = Color(0xFFF43F5E)
private val RoseDeep = Color(0xFF4C0519)
private val RosePale = Color(0xFFFFE4E6)
private val Ink = Color(0xFF09090B)
private val Card = Color(0xFF18181B)
private val Muted = Color(0xFFA1A1AA)
private val Paper = Color(0xFFFAFAFA)

private val TIME = DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault())

class BalanceWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { GlanceTheme { WidgetBody() } }
    }
}

@Composable
private fun WidgetBody() {
    val state = currentState<androidx.datastore.preferences.core.Preferences>()
    val updatedAt = state[WidgetKeys.updatedAt]
    val error = state[WidgetKeys.error]

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Ink)
            .cornerRadius(20.dp)
            .padding(12.dp)
            .clickable(actionStartActivity<MainActivity>())
    ) {
        Row(
            modifier = GlanceModifier.fillMaxWidth().defaultWeight(),
            verticalAlignment = Alignment.Vertical.CenterVertically
        ) {
            Tile(
                label = "Balance",
                value = money(state[WidgetKeys.balance]),
                emphasis = true,
                modifier = GlanceModifier.defaultWeight()
            )
            Tile(
                label = "Spent today",
                value = money(state[WidgetKeys.spentToday]),
                modifier = GlanceModifier.defaultWeight()
            )
        }
        Row(
            modifier = GlanceModifier.fillMaxWidth().defaultWeight(),
            verticalAlignment = Alignment.Vertical.CenterVertically
        ) {
            Tile(
                label = pendingLabel(state[WidgetKeys.pendingCount]),
                value = money(state[WidgetKeys.pendingAmount]),
                modifier = GlanceModifier.defaultWeight()
            )
            Tile(
                label = "Left this month",
                value = if (state[WidgetKeys.hasBudget] == 1) {
                    money(state[WidgetKeys.remainingThisMonth])
                } else {
                    "--"
                },
                footnote = if (state[WidgetKeys.hasBudget] == 1) {
                    "${money(state[WidgetKeys.perDay])}/day"
                } else {
                    null
                },
                modifier = GlanceModifier.defaultWeight()
            )
        }
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .padding(top = 6.dp, bottom = 2.dp)
                .clickable(actionRunCallback<RefreshWidgetAction>()),
            verticalAlignment = Alignment.Vertical.CenterVertically
        ) {
            Text(
                text = when {
                    error != null -> "$error · tap to retry"
                    updatedAt != null ->
                        "Updated ${TIME.format(Instant.ofEpochMilli(updatedAt).atZone(ZoneId.systemDefault()))}"
                    else -> "Tap to load"
                },
                style = TextStyle(fontSize = 13.sp, color = ColorProvider(Muted)),
                modifier = GlanceModifier.defaultWeight()
            )
            Text(
                text = "Refresh",
                style = TextStyle(
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = ColorProvider(Rose)
                )
            )
        }
    }
}

@Composable
private fun Tile(
    label: String,
    value: String,
    modifier: GlanceModifier = GlanceModifier,
    emphasis: Boolean = false,
    footnote: String? = null
) {
    Column(
        modifier = modifier.padding(end = 8.dp)
    ) {
        Text(
            text = label.uppercase(Locale.getDefault()),
            style = TextStyle(fontSize = 13.sp, color = ColorProvider(Muted))
        )
        Text(
            text = value,
            style = TextStyle(
                fontSize = if (emphasis) 34.sp else 26.sp,
                fontWeight = FontWeight.Bold,
                color = ColorProvider(if (emphasis) Rose else Paper)
            )
        )
        if (footnote != null) {
            Text(
                text = footnote,
                style = TextStyle(fontSize = 13.sp, color = ColorProvider(Muted))
            )
        }
    }
}

private fun pendingLabel(count: Int?) = when (count) {
    null, 0 -> "Unentered"
    1 -> "Unentered · 1"
    else -> "Unentered · $count"
}
