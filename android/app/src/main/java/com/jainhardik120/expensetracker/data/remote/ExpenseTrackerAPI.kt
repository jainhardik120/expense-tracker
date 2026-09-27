package com.jainhardik120.expensetracker.data.remote

import com.jainhardik120.expensetracker.data.entity.AccountItem
import com.jainhardik120.expensetracker.data.entity.CreateSelfTransferBody
import com.jainhardik120.expensetracker.data.entity.CreateStatementBody
import com.jainhardik120.expensetracker.data.entity.FriendItem
import com.jainhardik120.expensetracker.data.entity.IDResult
import com.jainhardik120.expensetracker.data.entity.MessageError
import com.jainhardik120.expensetracker.data.entity.Result
import com.jainhardik120.expensetracker.data.entity.SMSNotificationBody
import com.jainhardik120.expensetracker.data.entity.StatementsResponse
import com.jainhardik120.expensetracker.data.entity.SummaryResponse
import com.jainhardik120.expensetracker.data.entity.WidgetSummary

interface ExpenseTrackerAPI {
    suspend fun sendNotification(body: SMSNotificationBody): Result<IDResult, MessageError>
    suspend fun getStatements(page: Int, perPage: Int): Result<StatementsResponse, MessageError>
    /** Balances as at [end], and the movement between [start] and [end]. */
    suspend fun getSummary(start: String? = null, end: String? = null): Result<SummaryResponse, MessageError>
    suspend fun createStatement(body: CreateStatementBody): Result<List<IDResult>, MessageError>
    suspend fun updateStatement(
        id: String,
        body: CreateStatementBody
    ): Result<List<IDResult>, MessageError>

    suspend fun deleteStatement(id: String): Result<Unit, MessageError>
    suspend fun createSelfTransfer(body: CreateSelfTransferBody): Result<List<IDResult>, MessageError>
    suspend fun updateSelfTransfer(
        id: String,
        body: CreateSelfTransferBody
    ): Result<List<IDResult>, MessageError>

    suspend fun deleteSelfTransfer(id: String): Result<Unit, MessageError>
    /** The widget's four numbers, for the day that runs [dayStart] to [dayEnd]. */
    suspend fun getWidgetSummary(
        dayStart: String,
        dayEnd: String
    ): Result<WidgetSummary, MessageError>

    suspend fun getAccounts(): Result<List<AccountItem>, MessageError>
    suspend fun getFriends(): Result<List<FriendItem>, MessageError>
}

