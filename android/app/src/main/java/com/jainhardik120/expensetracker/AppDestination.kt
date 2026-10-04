package com.jainhardik120.expensetracker

import android.content.Intent

object AppDestination {
    const val ACTION_OPEN = "com.jainhardik120.expensetracker.OPEN_DESTINATION"
    const val EXTRA = "destination"
    const val INVESTMENTS = "investments"
    const val SMS = "sms"

    fun from(intent: Intent?): String? = intent?.getStringExtra(EXTRA)
}
