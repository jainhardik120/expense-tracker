package com.jainhardik120.expensetracker.auth

import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.suspendCancellableCoroutine
import net.openid.appauth.*
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import javax.inject.Inject
import dagger.hilt.android.qualifiers.ApplicationContext
import androidx.core.net.toUri

class AppAuthManager @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val tokenStore: TokenStore
) {
    private val serviceConfig = AuthorizationServiceConfiguration(
        AuthConfig.AUTH_ENDPOINT.toUri(),
        AuthConfig.TOKEN_ENDPOINT.toUri()
    )

    private val authService by lazy { AuthorizationService(context) }

    fun buildAuthRequest(): AuthorizationRequest {
        return AuthorizationRequest.Builder(
            serviceConfig,
            AuthConfig.CLIENT_ID,
            ResponseTypeValues.CODE,
            AuthConfig.REDIRECT_URI.toUri()
        )
            .setScope(AuthConfig.SCOPE)
            .setAdditionalParameters(mapOf("resource" to AuthConfig.RESOURCE))
            .build()
    }

    fun getAuthIntent(authRequest: AuthorizationRequest): Intent {
        return authService.getAuthorizationRequestIntent(authRequest)
    }

    suspend fun handleCallbackAndExchange(intent: Intent): TokenSet {
        val resp = AuthorizationResponse.fromIntent(intent)
            ?: throw IllegalStateException("No AuthorizationResponse found")
        val ex = AuthorizationException.fromIntent(intent)
        if (ex != null) throw ex
        val original = resp.createTokenExchangeRequest()
        val exchange = TokenRequest.Builder(original.configuration, original.clientId)
            .setGrantType(original.grantType)
            .setAuthorizationCode(original.authorizationCode)
            .setRedirectUri(original.redirectUri)
            .setCodeVerifier(original.codeVerifier)
            .setNonce(original.nonce)
            .setScope(original.scope)
            .setAdditionalParameters(
                original.additionalParameters + mapOf("resource" to AuthConfig.RESOURCE)
            )
            .build()

        val tokenResponse = performTokenRequest(exchange)
        val tokens = tokenResponse.toTokenSet()
        tokenStore.save(tokens)
        return tokens
    }

    suspend fun refresh(): TokenSet {
        val current = tokenStore.load() ?: throw IllegalStateException("No tokens")
        val rt = current.refreshToken ?: throw IllegalStateException("No refresh token")

        val refreshReq = TokenRequest.Builder(serviceConfig, AuthConfig.CLIENT_ID)
            .setGrantType(GrantTypeValues.REFRESH_TOKEN)
            .setRefreshToken(rt)
            .setScope(AuthConfig.SCOPE)
            .setAdditionalParameters(mapOf("resource" to AuthConfig.RESOURCE))
            .build()

        val tokenResponse = performTokenRequest(refreshReq)
        val merged = TokenSet(
            accessToken = tokenResponse.accessToken ?: current.accessToken,
            refreshToken = tokenResponse.refreshToken ?: current.refreshToken,
            idToken = tokenResponse.idToken ?: current.idToken,
            expiresAtEpochSec = tokenResponse.accessTokenExpirationTime?.div(1000L)
                ?: (System.currentTimeMillis() / 1000L + 3600L)
        )
        tokenStore.save(merged)
        return merged
    }

    fun logoutLocal() {
        tokenStore.clear()
    }

    private suspend fun performTokenRequest(req: TokenRequest): TokenResponse =
        suspendCancellableCoroutine { cont ->
            authService.performTokenRequest(req) { resp, ex ->
                when {
                    resp != null -> cont.resume(resp)
                    ex != null -> cont.resumeWithException(ex)
                    else -> cont.resumeWithException(IllegalStateException("Token request failed"))
                }
            }
        }
}

private fun TokenResponse.toTokenSet(): TokenSet {
    val expSec = (accessTokenExpirationTime?.div(1000L))
        ?: (System.currentTimeMillis() / 1000L + 3600L)
    return TokenSet(
        accessToken = accessToken ?: "",
        refreshToken = refreshToken,
        idToken = idToken,
        expiresAtEpochSec = expSec
    )
}
