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

interface ExpenseTrackerAPI {
    suspend fun sendNotification(body: SMSNotificationBody): Result<IDResult, MessageError>
    suspend fun getStatements(page: Int, perPage: Int): Result<StatementsResponse, MessageError>
    suspend fun getSummary(): Result<SummaryResponse, MessageError>
    suspend fun createStatement(body: CreateStatementBody): Result<List<IDResult>, MessageError>
    suspend fun deleteStatement(id: String): Result<Unit, MessageError>
    suspend fun createSelfTransfer(body: CreateSelfTransferBody): Result<List<IDResult>, MessageError>
    suspend fun deleteSelfTransfer(id: String): Result<Unit, MessageError>
    suspend fun getAccounts(): Result<List<AccountItem>, MessageError>
    suspend fun getFriends(): Result<List<FriendItem>, MessageError>
}

