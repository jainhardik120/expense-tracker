package com.jainhardik120.expensetracker.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ClientRequestException
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
        url: String,
        method: HttpMethod,
        body: T
    ): R {
        return client.request(url) {
            this.method = method
            contentType(ContentType.Application.Json)
            setBody(body)
        }.body()
    }

    private suspend inline fun <reified T> requestBuilder(
        url: String,
        method: HttpMethod
    ): T {
        return client.request(url) {
            this.method = method
        }.body()
    }

    override suspend fun sendNotification(body: SMSNotificationBody): Result<IDResult, MessageError> {
        return performApiRequest {
            requestBuilder<SMSNotificationBody, IDResult>(
                url = "https://expense-tracker.hardikja.in/api/external/sms-notifications",
                method = HttpMethod.Post,
                body = body
            )
        }
    }
}