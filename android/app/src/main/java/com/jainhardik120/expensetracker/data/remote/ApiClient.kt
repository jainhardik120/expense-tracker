package com.jainhardik120.expensetracker.data.remote

import com.jainhardik120.expensetracker.auth.AuthRepository
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.auth.Auth
import io.ktor.client.plugins.auth.providers.BearerTokens
import io.ktor.client.plugins.auth.providers.bearer
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.logging.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

fun createHttpClient(
    authRepo: AuthRepository
): HttpClient {
    return HttpClient(OkHttp) {
        expectSuccess = true
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }

        install(Logging) {
            level = LogLevel.INFO
        }

        install(Auth) {
            bearer {
                loadTokens {
                    authRepo.currentTokens()?.let {
                        BearerTokens(
                            accessToken = it.accessToken,
                            refreshToken = it.refreshToken ?: ""
                        )
                    }
                }
                refreshTokens {
                    val newTokens = runCatching {
                        authRepo.refresh()
                    }.getOrNull() ?: return@refreshTokens null

                    BearerTokens(
                        accessToken = newTokens.accessToken,
                        refreshToken = newTokens.refreshToken ?: ""
                    )
                }
                sendWithoutRequest { request ->
                    !request.url.encodedPath.startsWith("/api/auth")
                }
            }
        }
    }
}
