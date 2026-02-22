package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

@Serializable
data class CreateStatementBody(
    val amount: String,
    val category: String,
    val tags: List<String> = emptyList(),
    val accountId: String? = null,
    val friendId: String? = null,
    val statementKind: String,
    val createdAt: String
)

@Serializable
data class CreateSelfTransferBody(
    val fromAccountId: String,
    val toAccountId: String,
    val amount: String,
    val createdAt: String
)

@Serializable
data class AccountItem(
    val id: String,
    val userId: String,
    val startingBalance: String,
    val accountName: String,
    val createdAt: String? = null
)

@Serializable
data class FriendItem(
    val id: String,
    val userId: String,
    val name: String,
    val createdAt: String? = null
)
