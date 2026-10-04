package com.jainhardik120.expensetracker.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.jainhardik120.expensetracker.manager.SmsTransactionProcessor
import com.jainhardik120.expensetracker.work.SmsUploadWorker
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.hilt.android.EntryPointAccessors

class SmsBroadcastReceiver : BroadcastReceiver() {

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface SmsBroadcastReceiverEntryPoint {
        fun smsTransactionProcessor(): SmsTransactionProcessor
    }

    companion object {
        private const val TAG = "SmsBroadcastReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            return
        }

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) {
            return
        }

        data class SmsData(val body: StringBuilder, var timestamp: Long)
        val smsMap = mutableMapOf<String, SmsData>()
        for (message in messages) {
            val sender = message.originatingAddress ?: continue
            val body = message.messageBody ?: continue
            val timestamp = message.timestampMillis

            val existing = smsMap.getOrPut(sender) { SmsData(StringBuilder(), timestamp) }
            existing.body.append(body)
            if (timestamp < existing.timestamp) {
                existing.timestamp = timestamp
            }
        }

        val entryPoint = EntryPointAccessors.fromApplication(
            context.applicationContext,
            SmsBroadcastReceiverEntryPoint::class.java
        )
        val processor = entryPoint.smsTransactionProcessor()

        val pendingResult = goAsync()
        try {
            for ((sender, smsData) in smsMap) {
                Log.d(TAG, "Received SMS from: $sender at timestamp: ${smsData.timestamp}")
                val body = try {
                    processor.parse(sender, smsData.body.toString(), smsData.timestamp)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing SMS", e)
                    null
                } ?: continue
                SmsUploadWorker.enqueue(context, body).result.get()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error queueing SMS upload", e)
        } finally {
            pendingResult.finish()
        }
    }
}
