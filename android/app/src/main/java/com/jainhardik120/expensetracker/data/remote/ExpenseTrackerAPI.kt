package com.jainhardik120.expensetracker.data.remote

interface ExpenseTrackerAPI {
    suspend fun sendNotification(body: SMSNotificationBody) : Result<IDResult, MessageError>
}

