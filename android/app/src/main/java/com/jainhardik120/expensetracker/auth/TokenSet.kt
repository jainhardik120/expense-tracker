package com.jainhardik120.expensetracker.auth

data class TokenSet(
    val accessToken: String,
    val refreshToken: String?,
    val idToken: String?,
    val expiresAtEpochSec: Long
)