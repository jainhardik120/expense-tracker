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
import com.jainhardik120.expensetracker.data.entity.SplitBody
import com.jainhardik120.expensetracker.data.entity.SplitFields
import com.jainhardik120.expensetracker.data.entity.SplitItem
import com.jainhardik120.expensetracker.data.entity.StatementFilters
import com.jainhardik120.expensetracker.data.entity.StatementsResponse
import com.jainhardik120.expensetracker.data.entity.SummaryResponse
import com.jainhardik120.expensetracker.data.entity.TimelineDay
import com.jainhardik120.expensetracker.data.entity.WidgetSummary
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ResponseException
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.parameter
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import java.time.ZoneId

class ExpenseTrackerAPIImpl(
    private val client: HttpClient
) : ExpenseTrackerAPI {
    private suspend inline fun <T, reified R> performApiRequest(
        call: () -> T
    ): Result<T, R> {
        return try {
            val response = call.invoke()
            Result.Success(response)
        } catch (e: ResponseException) {
            try {
                val errorBody: R = e.response.body()
                Result.ClientException(errorBody, e.response.status)
            } catch (innerException: Exception) {
                Result.Exception("Deserialization failed: ${innerException.message}")
            }
        } catch (e: Exception) {
            Result.Exception(e.message)
        }
    }

    private suspend inline fun <reified T, reified R> requestBuilder(
        url: String, method: HttpMethod, body: T
    ): R {
        return client.request(url) {
            this.method = method
            contentType(ContentType.Application.Json)
            setBody(body)
        }.body()
    }

    private suspend inline fun <reified T> requestBuilder(
        url: String, method: HttpMethod
    ): T {
        return client.request(url) {
            this.method = method
        }.body()
    }

    override suspend fun sendNotification(body: SMSNotificationBody): Result<IDResult, MessageError> {
        return performApiRequest {
            requestBuilder<SMSNotificationBody, IDResult>(
                url = APIRoutes.SEND_NOTIFICATION, method = HttpMethod.Post, body = body
            )
        }
    }

    override suspend fun getStatements(
        page: Int,
        perPage: Int,
        filters: StatementFilters
    ): Result<StatementsResponse, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.STATEMENTS) {
                method = HttpMethod.Get
                parameter("page", page)
                parameter("perPage", perPage)
                filterParameters(filters)
            }.body()
        }
    }

    override suspend fun getStatementTimeline(
        filters: StatementFilters,
        timezone: String
    ): Result<List<TimelineDay>, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.TIMELINE) {
                method = HttpMethod.Get
                parameter("timezone", timezone)
                filterParameters(filters)
            }.body()
        }
    }

    override suspend fun getSummary(
        start: String?,
        end: String?
    ): Result<SummaryResponse, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.SUMMARY) {
                method = HttpMethod.Get
                if (start != null) parameter("start", start)
                if (end != null) parameter("end", end)
            }.body()
        }
    }

    override suspend fun getWidgetSummary(
        dayStart: String,
        dayEnd: String
    ): Result<WidgetSummary, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.WIDGET) {
                method = HttpMethod.Get
                parameter("dayStart", dayStart)
                parameter("dayEnd", dayEnd)
            }.body()
        }
    }

    override suspend fun createStatement(body: CreateStatementBody): Result<List<IDResult>, MessageError> {
        return performApiRequest {
            requestBuilder<CreateStatementBody, List<IDResult>>(
                url = APIRoutes.STATEMENTS, method = HttpMethod.Post, body = body
            )
        }
    }

    override suspend fun updateStatement(
        id: String,
        body: CreateStatementBody
    ): Result<List<IDResult>, MessageError> {
        return performApiRequest {
            requestBuilder<CreateStatementBody, List<IDResult>>(
                url = APIRoutes.statement(id), method = HttpMethod.Put, body = body
            )
        }
    }

    override suspend fun deleteStatement(id: String): Result<Unit, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.statement(id)) {
                method = HttpMethod.Delete
            }.body()
        }
    }

    override suspend fun createSelfTransfer(body: CreateSelfTransferBody): Result<List<IDResult>, MessageError> {
        return performApiRequest {
            requestBuilder<CreateSelfTransferBody, List<IDResult>>(
                url = APIRoutes.SELF_TRANSFER, method = HttpMethod.Post, body = body
            )
        }
    }

    override suspend fun updateSelfTransfer(
        id: String,
        body: CreateSelfTransferBody
    ): Result<List<IDResult>, MessageError> {
        return performApiRequest {
            requestBuilder<CreateSelfTransferBody, List<IDResult>>(
                url = APIRoutes.selfTransfer(id), method = HttpMethod.Put, body = body
            )
        }
    }

    override suspend fun deleteSelfTransfer(id: String): Result<Unit, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.selfTransfer(id)) {
                method = HttpMethod.Delete
            }.body()
        }
    }

    override suspend fun getInvestments(): Result<InvestmentsOverview, MessageError> {
        return performApiRequest {
            requestBuilder<InvestmentsOverview>(
                url = APIRoutes.INVESTMENTS, method = HttpMethod.Get
            )
        }
    }

    override suspend fun getAccounts(): Result<List<AccountItem>, MessageError> {
        return performApiRequest {
            requestBuilder<List<AccountItem>>(
                url = APIRoutes.ACCOUNTS, method = HttpMethod.Get
            )
        }
    }

    override suspend fun getFriends(): Result<List<FriendItem>, MessageError> {
        return performApiRequest {
            requestBuilder<List<FriendItem>>(
                url = APIRoutes.FRIENDS, method = HttpMethod.Get
            )
        }
    }

    override suspend fun getSplits(statementId: String): Result<List<SplitItem>, MessageError> {
        return performApiRequest {
            requestBuilder<List<SplitItem>>(url = APIRoutes.statementSplits(statementId), method = HttpMethod.Get)
        }
    }

    override suspend fun createSplit(
        statementId: String,
        fields: SplitFields
    ): Result<List<IDResult>, MessageError> {
        return performApiRequest {
            requestBuilder<SplitBody, List<IDResult>>(
                url = APIRoutes.statementSplits(statementId), method = HttpMethod.Post, body = SplitBody(fields)
            )
        }
    }

    override suspend fun updateSplit(
        splitId: String,
        fields: SplitFields
    ): Result<List<IDResult>, MessageError> {
        return performApiRequest {
            requestBuilder<SplitBody, List<IDResult>>(
                url = APIRoutes.split(splitId), method = HttpMethod.Put, body = SplitBody(fields)
            )
        }
    }

    override suspend fun deleteSplit(splitId: String): Result<Unit, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.split(splitId)) {
                method = HttpMethod.Delete
            }.body()
        }
    }

    override suspend fun bulkSplit(body: BulkSplitBody): Result<Unit, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.BULK_SPLIT) {
                method = HttpMethod.Post
                contentType(ContentType.Application.Json)
                setBody(body)
            }.body()
        }
    }

    override suspend fun getCategories(): Result<List<String>, MessageError> {
        return performApiRequest {
            requestBuilder<List<String>>(url = APIRoutes.CATEGORIES, method = HttpMethod.Get)
        }
    }

    override suspend fun getTags(): Result<List<String>, MessageError> {
        return performApiRequest {
            requestBuilder<List<String>>(url = APIRoutes.TAGS, method = HttpMethod.Get)
        }
    }

    override suspend fun getSmsNotifications(
        page: Int,
        perPage: Int,
        status: String?
    ): Result<SmsNotificationsResponse, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.SEND_NOTIFICATION) {
                method = HttpMethod.Get
                parameter("page", page)
                parameter("perPage", perPage)
                if (status != null) parameter("status", status)
            }.body()
        }
    }

    override suspend fun updateSmsNotification(
        id: String,
        body: UpdateSmsNotificationBody
    ): Result<IDResult, MessageError> {
        return performApiRequest {
            requestBuilder<UpdateSmsNotificationBody, IDResult>(
                url = APIRoutes.smsNotification(id), method = HttpMethod.Patch, body = body
            )
        }
    }

    override suspend fun getSmsInsertHints(id: String): Result<SmsInsertHints, MessageError> {
        return performApiRequest {
            requestBuilder<SmsInsertHints>(
                url = APIRoutes.smsNotificationHints(id), method = HttpMethod.Get
            )
        }
    }

    private fun HttpRequestBuilder.filterParameters(filters: StatementFilters) {
        val zone = ZoneId.systemDefault()
        filters.from?.let { parameter("start", it.atStartOfDay(zone).toInstant().toString()) }
        filters.to?.let {
            parameter("end", it.plusDays(1).atStartOfDay(zone).toInstant().minusMillis(1).toString())
        }
        arrayParameter("statementKind", filters.kinds)
        arrayParameter("account", filters.accounts)
        arrayParameter("category", filters.categories)
        arrayParameter("tags", filters.tags)
    }

    private fun HttpRequestBuilder.arrayParameter(name: String, values: Collection<String>) {
        val repeated = if (values.size == 1) values + values else values
        repeated.forEach { parameter(name, it) }
    }
}
