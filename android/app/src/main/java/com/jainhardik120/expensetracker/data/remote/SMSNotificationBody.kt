package com.jainhardik120.expensetracker.data.remote

import com.jainhardik120.expensetracker.parser.core.TransactionType
import kotlinx.serialization.Serializable

@Serializable
data class SMSNotificationBody(
    val amount: String,
    val type: String,
    val merchant: String?,
    val reference: String?,
    val accountLast4: String?,
    val smsBody: String,
    val sender: String,
    val timestamp: Long,
    val bankName: String,
    val isFromCard: Boolean = false,
    val currency: String = "INR",
    val fromAccount: String? = null,
    val toAccount: String? = null
)