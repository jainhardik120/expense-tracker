package com.jainhardik120.expensetracker.data.remote

import com.jainhardik120.expensetracker.BuildConfig


object APIRoutes {
    const val BASE_URL = BuildConfig.AUTH_RESOURCE

    const val SEND_NOTIFICATION = "${BASE_URL}/sms-notifications"
    const val STATEMENTS = "${BASE_URL}/statements"
    const val SUMMARY = "${BASE_URL}/summary"
    const val SELF_TRANSFER = "${BASE_URL}/statements/self-transfer"
    const val ACCOUNTS = "${BASE_URL}/accounts"
    const val FRIENDS = "${BASE_URL}/friends"

    fun deleteStatement(id: String) = "${STATEMENTS}/$id"
    fun deleteSelfTransfer(id: String) = "${SELF_TRANSFER}/$id"
}