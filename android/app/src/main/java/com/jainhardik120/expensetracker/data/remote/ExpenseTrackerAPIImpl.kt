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
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.request.parameter
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.contentType

class ExpenseTrackerAPIImpl(
    private val client: HttpClient
) : ExpenseTrackerAPI {
    private suspend inline fun <T, reified R> performApiRequest(
        call: () -> T
    ): Result<T, R> {
        return try {
            val response = call.invoke()
            Result.Success(response)
        } catch (e: ClientRequestException) {
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

    override suspend fun getStatements(page: Int, perPage: Int): Result<StatementsResponse, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.STATEMENTS) {
                method = HttpMethod.Get
                parameter("page", page)
                parameter("perPage", perPage)
            }.body()
        }
    }

    override suspend fun getSummary(): Result<SummaryResponse, MessageError> {
        return performApiRequest {
            requestBuilder<SummaryResponse>(
                url = APIRoutes.SUMMARY, method = HttpMethod.Get
            )
        }
    }

    override suspend fun createStatement(body: CreateStatementBody): Result<List<IDResult>, MessageError> {
        return performApiRequest {
            requestBuilder<CreateStatementBody, List<IDResult>>(
                url = APIRoutes.STATEMENTS, method = HttpMethod.Post, body = body
            )
        }
    }

    override suspend fun deleteStatement(id: String): Result<Unit, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.deleteStatement(id)) {
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

    override suspend fun deleteSelfTransfer(id: String): Result<Unit, MessageError> {
        return performApiRequest {
            client.request(APIRoutes.deleteSelfTransfer(id)) {
                method = HttpMethod.Delete
            }.body()
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
}