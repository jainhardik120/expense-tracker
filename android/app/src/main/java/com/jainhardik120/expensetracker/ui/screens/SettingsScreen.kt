package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import com.jainhardik120.expensetracker.widget.BalanceWidgetReceiver
import com.jainhardik120.expensetracker.widget.WidgetRefreshScheduler
import com.jainhardik120.expensetracker.widget.widgetPreferences

private const val HOURS_IN_DAY = 24

@Composable
fun SettingsScreen(onLogout: () -> Unit) {
    val context = LocalContext.current
    val preferences = remember { widgetPreferences(context) }
    var dayStartHour by remember { mutableIntStateOf(preferences.dayStartHour) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainer
            )
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "My day starts at",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Spending after midnight counts against the evening before, up to this hour.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = {
                            dayStartHour = (dayStartHour + HOURS_IN_DAY - 1) % HOURS_IN_DAY
                            preferences.dayStartHour = dayStartHour
                            WidgetRefreshScheduler.refreshNow(context)
                        }
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                            contentDescription = "Earlier"
                        )
                    }
                    Text(
                        text = "%02d:00".format(dayStartHour),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                    IconButton(
                        onClick = {
                            dayStartHour = (dayStartHour + 1) % HOURS_IN_DAY
                            preferences.dayStartHour = dayStartHour
                            WidgetRefreshScheduler.refreshNow(context)
                        }
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = "Later"
                        )
                    }
                }
            }
        }

        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { WidgetRefreshScheduler.refreshNow(context) }
        ) {
            Text("Refresh widget now")
        }

        // Saves hunting through the launcher's widget drawer.
        val widgetManager = remember { AppWidgetManager.getInstance(context) }
        if (widgetManager.isRequestPinAppWidgetSupported) {
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    widgetManager.requestPinAppWidget(
                        ComponentName(context, BalanceWidgetReceiver::class.java),
                        null,
                        null
                    )
                }
            ) {
                Text("Add widget to home screen")
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = onLogout,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error
            )
        ) {
            Text("Logout")
        }
    }
}
