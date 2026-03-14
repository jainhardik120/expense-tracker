package com.jainhardik120.expensetracker.manager

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppNotificationManager @Inject constructor(
    @param:ApplicationContext private val context: Context
) {
    companion object {
        private const val TRANSACTION_CHANNEL_ID = "transactions"
        private const val ERROR_CHANNEL_ID = "transaction_sync_errors"
    }

    private val notificationIds = AtomicInteger(1000)

    fun notifyTransactionReceived(parsedTransaction: ParsedTransaction) {
        showNotification(
            channelId = TRANSACTION_CHANNEL_ID,
            title = "Transaction message received",
            message = buildTransactionMessage(parsedTransaction),
            smallIcon = android.R.drawable.stat_notify_more,
            priority = NotificationCompat.PRIORITY_DEFAULT
        )
    }

    fun notifySmsSyncError(parsedTransaction: ParsedTransaction, reason: String?) {
        val errorSuffix = reason?.takeIf { it.isNotBlank() } ?: "Please open the app and try again."
        showNotification(
            channelId = ERROR_CHANNEL_ID,
            title = "Failed to sync transaction",
            message = "${buildTransactionMessage(parsedTransaction)}. $errorSuffix",
            smallIcon = android.R.drawable.stat_notify_error,
            priority = NotificationCompat.PRIORITY_HIGH
        )
    }

    private fun showNotification(
        channelId: String,
        title: String,
        message: String,
        smallIcon: Int,
        priority: Int
    ) {
        if (!canPostNotifications()) {
            return
        }

        createChannelsIfNeeded()
        val notificationManager = NotificationManagerCompat.from(context)
        if (!notificationManager.areNotificationsEnabled()) {
            return
        }

        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val pendingIntent = launchIntent?.let {
            PendingIntent.getActivity(
                context,
                0,
                it.apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(smallIcon)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(priority)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        notificationManager.notifySafely(notificationIds.incrementAndGet(), notification)
    }

    private fun canPostNotifications(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
    }

    private fun createChannelsIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val notificationManager = context.getSystemService(NotificationManager::class.java)
        val channels = listOf(
            NotificationChannel(
                TRANSACTION_CHANNEL_ID,
                "Transaction updates",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notifications when a transaction SMS is detected."
            },
            NotificationChannel(
                ERROR_CHANNEL_ID,
                "Transaction sync errors",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications when a transaction SMS fails to sync."
            }
        )

        notificationManager.createNotificationChannels(channels)
    }

    private fun buildTransactionMessage(parsedTransaction: ParsedTransaction): String {
        val merchant = parsedTransaction.merchant?.takeIf { it.isNotBlank() } ?: "Unknown merchant"
        return "${parsedTransaction.bankName}: ${parsedTransaction.currency} ${parsedTransaction.amount} at $merchant"
    }
}

@SuppressLint("MissingPermission")
private fun NotificationManagerCompat.notifySafely(
    notificationId: Int,
    notification: android.app.Notification
) {
    notify(notificationId, notification)
}
