package com.jainhardik120.expensetracker.manager

import android.util.Log
import com.jainhardik120.expensetracker.data.entity.Result
import com.jainhardik120.expensetracker.data.entity.SMSNotificationBody
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.bank.BankParserFactory
import java.util.Locale
import java.util.Locale.getDefault
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Shared processor for SMS transactions. Used by both SmsBroadcastReceiver
 * and OptimizedSmsReaderWorker to ensure consistent transaction processing.
 */
@Singleton
class SmsTransactionProcessor @Inject constructor(
    private val api: ExpenseTrackerAPI
) {
    companion object {
        private const val TAG = "SmsTransactionProcessor"
    }

    /**
     * Result of processing an SMS message
     */
    data class ProcessingResult(
        val success: Boolean,
        val transactionId: String? = null,
        val reason: String? = null
    )

    /**
     * Parses and saves a transaction from an SMS message.
     *
     * @param sender SMS sender address
     * @param body SMS body text
     * @param timestamp SMS timestamp in milliseconds
     * @return ProcessingResult indicating success/failure and transaction ID
     */
    suspend fun processAndSaveTransaction(
        sender: String,
        body: String,
        timestamp: Long
    ): ProcessingResult {
        try {
            // Get the appropriate parser for this sender
            val parser = BankParserFactory.getParser(sender) ?: return ProcessingResult(
                false,
                reason = "No parser found for sender: $sender"
            )

            // Parse the SMS
            val parsedTransaction =
                parser.parse(body, sender, timestamp) ?: return ProcessingResult(
                    false,
                    reason = "Could not parse transaction from SMS"
                )

            Log.d(
                TAG,
                "Parsed transaction: ${parsedTransaction.amount} from ${parsedTransaction.bankName}"
            )

            // Save the transaction
            return saveParsedTransaction(parsedTransaction, body)
        } catch (e: Exception) {
            Log.e(TAG, "Error processing SMS", e)
            return ProcessingResult(false, reason = e.message)
        }
    }

    suspend fun saveParsedTransaction(
        parsedTransaction: ParsedTransaction,
        smsBody: String
    ): ProcessingResult {
        return when (val result = api.sendNotification(SMSNotificationBody(
            amount = parsedTransaction.amount.toString(),
            type = parsedTransaction.type.toString().lowercase(getDefault()),
            merchant = parsedTransaction.merchant ?: "Unknown Merchant",
            reference = parsedTransaction.reference ?: "No Reference",
            accountLast4 = parsedTransaction.accountLast4 ?: "0000",
            smsBody = smsBody,
            sender = parsedTransaction.sender,
            timestamp = parsedTransaction.timestamp,
            bankName = parsedTransaction.bankName,
            isFromCard = parsedTransaction.isFromCard
        ))) {
            is Result.Success -> {
                val transactionId = result.data?.id
                Log.d(TAG, "Transaction saved with ID: $transactionId")
                ProcessingResult(true, transactionId = transactionId)
            }

            is Result.ClientException -> {
                Log.e(TAG, "Client error saving transaction: ${result.errorBody}")
                ProcessingResult(false, reason = "Client error: ${result.errorBody}")
            }

            is Result.Exception -> {
                Log.e(TAG, "Exception saving transaction: ${result.errorMessage}")
                ProcessingResult(false, reason = result.errorMessage)
            }
        }
    }
}
