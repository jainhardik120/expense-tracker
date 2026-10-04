package com.jainhardik120.expensetracker.auth

sealed class AuthState {
    data class SignedOut(val notice: String? = null) : AuthState()
    data class SignedIn(val tokens: TokenSet) : AuthState()
    data class Error(val message: String) : AuthState()
    data object Loading : AuthState()
}