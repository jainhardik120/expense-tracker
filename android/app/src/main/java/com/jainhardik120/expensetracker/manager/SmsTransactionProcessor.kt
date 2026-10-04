package com.jainhardik120.expensetracker.manager

import android.util.Log
import com.jainhardik120.expensetracker.data.entity.Result
import com.jainhardik120.expensetracker.data.entity.SMSNotificationBody
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.parser.core.bank.BankParserFactory
import io.ktor.http.HttpStatusCode
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SmsTransactionProcessor @Inject constructor(
    private val api: ExpenseTrackerAPI,
    private val notificationManager: AppNotificationManager
) {
    companion object {
        private const val TAG = "SmsTransactionProcessor"
    }

    sealed interface UploadOutcome {
        data object Saved : UploadOutcome

        data class Rejected(val reason: String) : UploadOutcome

        data class Unavailable(val reason: String) : UploadOutcome
    }

    fun parse(sender: String, body: String, timestamp: Long): SMSNotificationBody? {
        val parser = BankParserFactory.getParser(sender)
        if (parser == null) {
            Log.d(TAG, "No parser found for sender: $sender")
            return null
        }
        val parsed = parser.parse(body, sender, timestamp)
        if (parsed == null) {
            Log.d(TAG, "Could not parse a transaction out of a message from $sender")
            return null
        }
        Log.d(TAG, "Parsed transaction: ${parsed.amount} from ${parsed.bankName}")
        notificationManager.notifyTransactionReceived(parsed)
        return SMSNotificationBody(
            amount = parsed.amount.toString(),
            type = parsed.type.toString().lowercase(),
            merchant = parsed.merchant ?: "Unknown Merchant",
            reference = parsed.reference ?: "No Reference",
            accountLast4 = parsed.accountLast4 ?: "0000",
            smsBody = body,
            sender = parsed.sender,
            timestamp = parsed.timestamp,
            bankName = parsed.bankName,
            isFromCard = parsed.isFromCard
        )
    }

    suspend fun upload(body: SMSNotificationBody): UploadOutcome =
        when (val result = api.sendNotification(body)) {
            is Result.Success -> {
                Log.d(TAG, "Transaction saved with ID: ${result.data?.id}")
                UploadOutcome.Saved
            }

            is Result.ClientException -> {
                val reason = "${result.statusCode}: ${result.errorBody}"
                if (result.statusCode in RETRYABLE_STATUSES) {
                    UploadOutcome.Unavailable(reason)
                } else {
                    UploadOutcome.Rejected(reason)
                }
            }

            is Result.Exception -> UploadOutcome.Unavailable(result.errorMessage ?: "No connection")
        }

    fun notifyUploadFailed(body: SMSNotificationBody, reason: String) {
        val merchant = body.merchant?.takeIf { it.isNotBlank() } ?: "Unknown merchant"
        notificationManager.notifySmsSyncError(
            "${body.bankName}: ${body.currency} ${body.amount} at $merchant",
            reason
        )
    }
}

private val RETRYABLE_STATUSES = setOf(
    HttpStatusCode.Unauthorized,
    HttpStatusCode.RequestTimeout,
    HttpStatusCode.TooManyRequests
)
