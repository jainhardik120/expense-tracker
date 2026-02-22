package com.jainhardik120.expensetracker.data.remote

import com.jainhardik120.expensetracker.data.entity.IDResult
import com.jainhardik120.expensetracker.data.entity.MessageError
import com.jainhardik120.expensetracker.data.entity.Result
import com.jainhardik120.expensetracker.data.entity.SMSNotificationBody
import com.jainhardik120.expensetracker.data.entity.StatementsResponse
import com.jainhardik120.expensetracker.data.entity.SummaryResponse

interface ExpenseTrackerAPI {
    suspend fun sendNotification(body: SMSNotificationBody): Result<IDResult, MessageError>
    suspend fun getStatements(page: Int, perPage: Int): Result<StatementsResponse, MessageError>
    suspend fun getSummary(): Result<SummaryResponse, MessageError>
}

