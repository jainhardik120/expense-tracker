package com.jainhardik120.expensetracker.manager

import android.util.Log
import com.jainhardik120.expensetracker.data.entity.Result
import com.jainhardik120.expensetracker.data.entity.SMSNotificationBody
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.parser.core.bank.BankParserFactory
import io.ktor.http.HttpStatusCode
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Turns a transaction SMS into a request, and sends it.
 *
 * Parsing and sending are separate: the parse happens in the broadcast
 * receiver, where the message is, and the send happens in a worker that can
 * be retried. Anything that carried a transaction from one to the other would
 * have to survive the process dying, so what crosses that line is the request
 * itself.
 */
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

        /** The server understood the request and refused it. Sending it again will not help. */
        data class Rejected(val reason: String) : UploadOutcome

        /** Offline, timed out, or the server could not answer. Worth another go. */
        data class Unavailable(val reason: String) : UploadOutcome
    }

    /**
     * Reads a transaction out of an SMS and tells the user it arrived.
     *
     * Returns null when the message is not one of ours: an unknown sender, or
     * a message from a bank that carries no transaction.
     */
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
                // 401 means the access token had not been refreshed yet, and
                // the rest of these are the server asking to be left alone for
                // a moment. Everything else in the 4xx range is about the
                // request, and the request will not change.
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
