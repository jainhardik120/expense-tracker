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
    const val WIDGET = "${BASE_URL}/widget"
    const val INVESTMENTS = "${BASE_URL}/investments"
    const val CATEGORIES = "${STATEMENTS}/categories"
    const val TAGS = "${STATEMENTS}/tags"
    const val TIMELINE = "${BASE_URL}/statements/timeline"

    fun statement(id: String) = "${STATEMENTS}/$id"
    fun selfTransfer(id: String) = "${SELF_TRANSFER}/$id"
    fun smsNotification(id: String) = "${SEND_NOTIFICATION}/$id"
    fun smsNotificationHints(id: String) = "${SEND_NOTIFICATION}/$id/hints"
}