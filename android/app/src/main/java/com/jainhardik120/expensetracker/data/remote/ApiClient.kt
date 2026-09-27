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
            // encodeDefaults, because a field left at its default — no tags,
            // no friend — would otherwise be dropped from the body entirely,
            // and the server reads a missing field as a missing field.
            json(Json { ignoreUnknownKeys = true; encodeDefaults = true })
        }

        install(Logging) {
            level = LogLevel.INFO
        }

        install(Auth) {
            bearer {
                // A refresh that the server has already committed must not be
                // thrown away because the request that triggered it was
                // cancelled: the new token would be lost and the old one is
                // already retired.
                nonCancellableRefresh = true
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
