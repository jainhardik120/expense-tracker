package com.jainhardik120.expensetracker.auth

import com.jainhardik120.expensetracker.BuildConfig

object AuthConfig {
    const val CLIENT_ID = BuildConfig.AUTH_CLIENT_ID
    const val REDIRECT_URI = BuildConfig.AUTH_REDIRECT_URI
    const val AUTH_ENDPOINT = BuildConfig.AUTH_AUTHORIZE_URL
    const val TOKEN_ENDPOINT = BuildConfig.AUTH_TOKEN_URL
    const val RESOURCE = BuildConfig.AUTH_RESOURCE
    const val SCOPE = "openid email profile offline_access"
}