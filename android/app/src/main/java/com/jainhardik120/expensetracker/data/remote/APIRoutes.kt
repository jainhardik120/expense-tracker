package com.jainhardik120.expensetracker.data.remote

import com.jainhardik120.expensetracker.BuildConfig

object APIRoutes {
    const val BASE_URL = BuildConfig.AUTH_RESOURCE

    const val SEND_NOTIFICATION = "${BASE_URL}/sms-notifications"
    const val STATEMENTS = "${BASE_URL}/statements"
    const val SUMMARY = "${BASE_URL}/summary"
    const val SUMMARY_CHARTS = "${BASE_URL}/summary/charts"
    const val SELF_TRANSFER = "${BASE_URL}/statements/self-transfer"
    const val ACCOUNTS = "${BASE_URL}/accounts"
    const val FRIENDS = "${BASE_URL}/friends"
    const val WIDGET = "${BASE_URL}/widget"
    const val INVESTMENTS = "${BASE_URL}/investments"
    const val INVESTMENT_CHART = "${BASE_URL}/investments/chart"
    const val TODAY_ESTIMATE = "${BASE_URL}/investments/today-estimate"
    const val ETF_ESTIMATE = "${BASE_URL}/investments/etf-estimate"
    const val ALLOCATION = "${BASE_URL}/investments/allocation"
    const val MARKETS = "${BASE_URL}/investments/markets"
    const val MARKET_CHART = "${BASE_URL}/investments/markets/chart"
    const val METAL_CHARTS = "${BASE_URL}/investments/metal-charts"
    const val METAL_BUY_PRICES = "${BASE_URL}/investments/metal-buy-prices"
    const val CATEGORIES = "${STATEMENTS}/categories"
    const val TAGS = "${STATEMENTS}/tags"
    const val TIMELINE = "${BASE_URL}/statements/timeline"
    const val BULK_SPLIT = "${BASE_URL}/statements/splits/bulk"

    fun statement(id: String) = "${STATEMENTS}/$id"
    fun selfTransfer(id: String) = "${SELF_TRANSFER}/$id"
    fun statementSplits(id: String) = "${BASE_URL}/statements/$id/splits"
    fun split(id: String) = "${BASE_URL}/statements/splits/$id"
    fun smsNotification(id: String) = "${SEND_NOTIFICATION}/$id"
    fun smsNotificationHints(id: String) = "${SEND_NOTIFICATION}/$id/hints"
}