package com.jainhardik120.expensetracker.data.remote

import com.jainhardik120.expensetracker.BuildConfig


object APIRoutes {
    const val BASE_URL = BuildConfig.AUTH_RESOURCE

    const val SEND_NOTIFICATION = "${BASE_URL}/sms-notifications"
}