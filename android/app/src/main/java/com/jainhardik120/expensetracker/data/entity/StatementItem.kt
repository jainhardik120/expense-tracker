package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

@Serializable
data class StatementItem(
    val id: String,
    val createdAt: String,
    val userId: String,
    val amount: String,
    val type: String,
    val statementKind: String,
    val accountId: String? = null,
    val friendId: String? = null,
    val category: String? = null,
    val tags: List<String> = emptyList(),
    val splitAmount: Double = 0.0,
    val accountName: String? = null,
    val friendName: String? = null,
    val fromAccountId: String? = null,
    val toAccountId: String? = null,
    val fromAccount: String? = null,
    val toAccount: String? = null
)
