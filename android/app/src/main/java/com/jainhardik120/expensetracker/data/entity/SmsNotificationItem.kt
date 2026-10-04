package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

@Serializable
data class SmsNotificationItem(
    val id: String,
    val amount: String,
    val type: String,
    val merchant: String? = null,
    val reference: String? = null,
    val accountLast4: String? = null,
    val smsBody: String,
    val sender: String,
    val createdAt: String,
    val bankName: String,
    val isFromCard: Boolean = false,
    val currency: String = "INR",
    val fromAccount: String? = null,
    val toAccount: String? = null,
    val status: String
)

@Serializable
data class SmsNotificationsResponse(
    val notifications: List<SmsNotificationItem>,
    val pageCount: Int,
    val rowsCount: Int
)

@Serializable
data class UpdateSmsNotificationBody(
    val status: String,
    val statementId: String? = null
)

@Serializable
data class SmsInsertHints(
    val bankIdHint: List<String> = emptyList(),
    val categoryHint: List<String> = emptyList(),
    val tagsHint: List<String> = emptyList()
)
