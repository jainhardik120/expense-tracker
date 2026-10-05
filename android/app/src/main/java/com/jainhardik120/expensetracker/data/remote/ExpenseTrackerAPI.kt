package com.jainhardik120.expensetracker.data.remote

import com.jainhardik120.expensetracker.data.entity.AccountItem
import com.jainhardik120.expensetracker.data.entity.CreateSelfTransferBody
import com.jainhardik120.expensetracker.data.entity.CreateStatementBody
import com.jainhardik120.expensetracker.data.entity.FriendItem
import com.jainhardik120.expensetracker.data.entity.IDResult
import com.jainhardik120.expensetracker.data.entity.InvestmentsOverview
import com.jainhardik120.expensetracker.data.entity.MessageError
import com.jainhardik120.expensetracker.data.entity.Result
import com.jainhardik120.expensetracker.data.entity.SMSNotificationBody
import com.jainhardik120.expensetracker.data.entity.SmsInsertHints
import com.jainhardik120.expensetracker.data.entity.SmsNotificationsResponse
import com.jainhardik120.expensetracker.data.entity.UpdateSmsNotificationBody
import com.jainhardik120.expensetracker.data.entity.BulkSplitBody
import com.jainhardik120.expensetracker.data.entity.SplitFields
import com.jainhardik120.expensetracker.data.entity.SplitItem
import com.jainhardik120.expensetracker.data.entity.StatementFilters
import com.jainhardik120.expensetracker.data.entity.StatementsResponse
import com.jainhardik120.expensetracker.data.entity.SummaryResponse
import com.jainhardik120.expensetracker.data.entity.TimelineDay
import com.jainhardik120.expensetracker.data.entity.WidgetSummary

interface ExpenseTrackerAPI {
    suspend fun sendNotification(body: SMSNotificationBody): Result<IDResult, MessageError>
    suspend fun getStatements(
        page: Int,
        perPage: Int,
        filters: StatementFilters = StatementFilters()
    ): Result<StatementsResponse, MessageError>
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
    suspend fun getWidgetSummary(
        dayStart: String,
        dayEnd: String
    ): Result<WidgetSummary, MessageError>

    suspend fun getInvestments(): Result<InvestmentsOverview, MessageError>

    suspend fun getAccounts(): Result<List<AccountItem>, MessageError>
    suspend fun getFriends(): Result<List<FriendItem>, MessageError>
    suspend fun getStatementTimeline(
        filters: StatementFilters,
        timezone: String
    ): Result<List<TimelineDay>, MessageError>

    suspend fun getSplits(statementId: String): Result<List<SplitItem>, MessageError>
    suspend fun createSplit(statementId: String, fields: SplitFields): Result<List<IDResult>, MessageError>
    suspend fun updateSplit(splitId: String, fields: SplitFields): Result<List<IDResult>, MessageError>
    suspend fun deleteSplit(splitId: String): Result<Unit, MessageError>
    suspend fun bulkSplit(body: BulkSplitBody): Result<Unit, MessageError>

    suspend fun getCategories(): Result<List<String>, MessageError>
    suspend fun getTags(): Result<List<String>, MessageError>

    suspend fun getSmsNotifications(
        page: Int,
        perPage: Int,
        status: String?
    ): Result<SmsNotificationsResponse, MessageError>

    suspend fun updateSmsNotification(
        id: String,
        body: UpdateSmsNotificationBody
    ): Result<IDResult, MessageError>

    suspend fun getSmsInsertHints(id: String): Result<SmsInsertHints, MessageError>
}

