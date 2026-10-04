package com.jainhardik120.expensetracker.auth

import android.content.Intent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import net.openid.appauth.AuthorizationException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val appAuth: AppAuthManager,
    private val tokenStore: TokenStore
) {
    private val _state = MutableStateFlow(
        tokenStore.load()?.let { AuthState.SignedIn(it) } ?: AuthState.SignedOut()
    )
    val state: StateFlow<AuthState> = _state

    fun authIntent() = appAuth.getAuthIntent(appAuth.buildAuthRequest())

    suspend fun onAuthCallback(intent: Intent) {
        _state.value = AuthState.Loading
        try {
            val tokens = appAuth.handleCallbackAndExchange(intent)
            _state.value = AuthState.SignedIn(tokens)
        } catch (e: AuthorizationException) {
            _state.value = if (e.isUserCancellation()) {
                AuthState.SignedOut()
            } else {
                AuthState.Error(e.errorDescription ?: e.error ?: "Sign-in failed")
            }
        } catch (t: Throwable) {
            _state.value = AuthState.Error(t.message ?: "Sign-in failed")
        }
    }

    suspend fun refresh(): TokenSet {
        val tokens = try {
            appAuth.refresh()
        } catch (e: AuthorizationException) {
            if (e.type == AuthorizationException.TYPE_OAUTH_TOKEN_ERROR) {
                expireSession()
            }
            throw e
        } catch (e: IllegalStateException) {
            expireSession()
            throw e
        }
        _state.value = AuthState.SignedIn(tokens)
        return tokens
    }

    fun logout() {
        appAuth.logoutLocal()
        _state.value = AuthState.SignedOut()
    }

    fun currentTokens(): TokenSet? = tokenStore.load()

    private fun expireSession() {
        appAuth.logoutLocal()
        _state.value = AuthState.SignedOut(SESSION_EXPIRED)
    }

    private fun AuthorizationException.isUserCancellation(): Boolean =
        code == AuthorizationException.GeneralErrors.USER_CANCELED_AUTH_FLOW.code ||
            code == AuthorizationException.GeneralErrors.PROGRAM_CANCELED_AUTH_FLOW.code

    private companion object {
        const val SESSION_EXPIRED = "Your session has expired. Sign in again to continue."
    }
}
