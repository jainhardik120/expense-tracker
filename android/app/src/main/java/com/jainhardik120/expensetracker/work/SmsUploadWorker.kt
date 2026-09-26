package com.jainhardik120.expensetracker.work

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.jainhardik120.expensetracker.data.entity.SMSNotificationBody
import com.jainhardik120.expensetracker.manager.SmsTransactionProcessor
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.serialization.json.Json
import java.util.concurrent.TimeUnit

/**
 * Uploads one parsed transaction, and keeps trying.
 *
 * The upload used to happen inline in the broadcast receiver, so a transaction
 * was lost for good if the network was down, the server was slow, or the
 * process was killed on the way — and nothing ever came back for it. Handing
 * it to WorkManager means it survives all three: the request is written to
 * disk before the broadcast returns, and it is retried with backoff until the
 * server takes it.
 */
@HiltWorker
class SmsUploadWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val processor: SmsTransactionProcessor
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val payload = inputData.getString(KEY_PAYLOAD) ?: return Result.failure()
        val body = runCatching { Json.decodeFromString<SMSNotificationBody>(payload) }.getOrNull()
            ?: return Result.failure()

        return when (val outcome = processor.upload(body)) {
            is SmsTransactionProcessor.UploadOutcome.Saved -> Result.success()
            // The server understood the request and refused it; sending the
            // same bytes again will be refused the same way.
            is SmsTransactionProcessor.UploadOutcome.Rejected -> {
                Log.e(TAG, "Giving up on ${body.reference}: ${outcome.reason}")
                processor.notifyUploadFailed(body, outcome.reason)
                Result.failure()
            }
            // Offline, timed out, 5xx, or an access token that could not be
            // refreshed yet: all worth another go.
            is SmsTransactionProcessor.UploadOutcome.Unavailable -> {
                Log.w(TAG, "Retrying ${body.reference}: ${outcome.reason} (attempt $runAttemptCount)")
                if (runAttemptCount >= ATTEMPTS_BEFORE_TELLING_THE_USER) {
                    processor.notifyUploadFailed(body, outcome.reason)
                }
                Result.retry()
            }
        }
    }

    companion object {
        private const val TAG = "SmsUploadWorker"
        private const val KEY_PAYLOAD = "payload"
        private const val ATTEMPTS_BEFORE_TELLING_THE_USER = 5
        private const val BACKOFF_SECONDS = 30L

        /**
         * One piece of work per message: the name is the message itself, so a
         * broadcast Android decides to redeliver cannot upload it twice.
         */
        fun enqueue(context: Context, body: SMSNotificationBody): androidx.work.Operation {
            val request = OneTimeWorkRequestBuilder<SmsUploadWorker>()
                .setInputData(workDataOf(KEY_PAYLOAD to Json.encodeToString(body)))
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
                .build()
            return WorkManager.getInstance(context).enqueueUniqueWork(
                workName(body),
                ExistingWorkPolicy.KEEP,
                request
            )
        }

        private fun workName(body: SMSNotificationBody) =
            "sms-upload:${body.sender}:${body.timestamp}:${body.amount}"
    }
}
