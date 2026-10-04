package com.jainhardik120.expensetracker.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
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
import com.jainhardik120.expensetracker.AppDestination
import com.jainhardik120.expensetracker.MainActivity
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs

private val Ink = Color(0xFF09090B)
private val Muted = Color(0xFFA1A1AA)
private val Paper = Color(0xFFFAFAFA)
private val Gain = Color(0xFF4ADE80)
private val Loss = Color(0xFFF87171)
private val Rose = Color(0xFFF43F5E)

private val TIME = DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault())

class InvestmentWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val openInvestments = Intent(context, MainActivity::class.java)
            .setAction(AppDestination.ACTION_OPEN)
            .putExtra(AppDestination.EXTRA, AppDestination.INVESTMENTS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        provideContent { GlanceTheme { InvestmentWidgetBody(openInvestments) } }
    }
}

@Composable
private fun InvestmentWidgetBody(openInvestments: Intent) {
    val state = currentState<androidx.datastore.preferences.core.Preferences>()
    val updatedAt = state[InvestmentWidgetKeys.updatedAt]
    val error = state[InvestmentWidgetKeys.error]

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Ink)
            .cornerRadius(20.dp)
            .padding(12.dp)
            .clickable(actionStartActivity(openInvestments))
    ) {
        Tile(
            label = "Portfolio",
            value = money(state[InvestmentWidgetKeys.valuation]),
            footnote = investedFootnote(state[InvestmentWidgetKeys.invested]),
            emphasis = true,
            modifier = GlanceModifier.fillMaxWidth().defaultWeight()
        )
        Row(
            modifier = GlanceModifier.fillMaxWidth().defaultWeight(),
            verticalAlignment = Alignment.Vertical.CenterVertically
        ) {
            Tile(
                label = "Today",
                value = signedMoney(state[InvestmentWidgetKeys.dayChange]),
                footnote = percentageFootnote(
                    state[InvestmentWidgetKeys.dayChangePercentage],
                    state[InvestmentWidgetKeys.hasDayChangePercentage]
                ),
                tone = toneOf(state[InvestmentWidgetKeys.dayChange]),
                modifier = GlanceModifier.defaultWeight()
            )
            Tile(
                label = "Total P&L",
                value = signedMoney(state[InvestmentWidgetKeys.pnl]),
                footnote = percentageFootnote(
                    state[InvestmentWidgetKeys.pnlPercentage],
                    state[InvestmentWidgetKeys.hasPnlPercentage]
                ),
                tone = toneOf(state[InvestmentWidgetKeys.pnl]),
                modifier = GlanceModifier.defaultWeight()
            )
        }
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .padding(top = 6.dp, bottom = 2.dp)
                .clickable(actionRunCallback<RefreshInvestmentWidgetAction>()),
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
    tone: Color? = null,
    footnote: String? = null
) {
    Column(modifier = modifier.padding(end = 8.dp)) {
        Text(
            text = label.uppercase(Locale.getDefault()),
            style = TextStyle(fontSize = 12.sp, color = ColorProvider(Muted))
        )
        Text(
            text = value,
            style = TextStyle(
                fontSize = if (emphasis) 28.sp else 20.sp,
                fontWeight = FontWeight.Bold,
                color = ColorProvider(tone ?: if (emphasis) Rose else Paper)
            )
        )
        if (footnote != null) {
            Text(
                text = footnote,
                style = TextStyle(fontSize = 12.sp, color = ColorProvider(Muted))
            )
        }
    }
}

private fun toneOf(value: Double?): Color? = when {
    value == null -> null
    value < 0 -> Loss
    value > 0 -> Gain
    else -> null
}

private fun investedFootnote(invested: Double?): String? =
    if (invested == null) null else "${money(invested)} in"

private fun percentageFootnote(value: Double?, has: Int?): String? {
    if (has != 1 || value == null) {
        return null
    }
    return String.format(Locale.getDefault(), "%+.2f%%", value)
}
