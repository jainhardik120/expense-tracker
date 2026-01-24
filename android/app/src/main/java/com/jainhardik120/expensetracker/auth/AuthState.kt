package com.jainhardik120.expensetracker.auth

sealed class AuthState {
    data object SignedOut : AuthState()
    data class SignedIn(val tokens: TokenSet) : AuthState()
    data class Error(val message: String) : AuthState()
    data object Loading : AuthState()
}