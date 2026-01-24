package com.jainhardik120.expensetracker.auth

import android.content.Intent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val appAuth: AppAuthManager,
    private val tokenStore: TokenStore
) {
    private val _state = MutableStateFlow(
        tokenStore.load()?.let { AuthState.SignedIn(it) } ?: AuthState.SignedOut
    )
    val state: StateFlow<AuthState> = _state

    fun authIntent() = appAuth.getAuthIntent(appAuth.buildAuthRequest())

    suspend fun onAuthCallback(intent: Intent) {
        _state.value = AuthState.Loading
        try {
            val tokens = appAuth.handleCallbackAndExchange(intent)
            _state.value = AuthState.SignedIn(tokens)
        } catch (t: Throwable) {
            _state.value = AuthState.Error(t.message ?: "Auth failed")
        }
    }

    suspend fun refresh(): TokenSet {
        val tokens = appAuth.refresh()
        _state.value = AuthState.SignedIn(tokens)
        return tokens
    }

    fun logout() {
        appAuth.logoutLocal()
        _state.value = AuthState.SignedOut
    }

    fun currentTokens(): TokenSet? = tokenStore.load()
}
