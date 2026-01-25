package com.jainhardik120.expensetracker.data.remote

import com.jainhardik120.expensetracker.data.entity.IDResult
import com.jainhardik120.expensetracker.data.entity.MessageError
import com.jainhardik120.expensetracker.data.entity.Result
import com.jainhardik120.expensetracker.data.entity.SMSNotificationBody

interface ExpenseTrackerAPI {
    suspend fun sendNotification(body: SMSNotificationBody) : Result<IDResult, MessageError>
}

