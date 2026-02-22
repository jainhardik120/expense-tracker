package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

@Serializable
data class AccountTransferSummary(
    val expenses: Double,
    val selfTransfers: Double,
    val outsideTransactions: Double,
    val friendTransactions: Double,
    val totalTransfers: Double,
    val startingBalance: Double,
    val finalBalance: Double
)

@Serializable
data class AccountInfo(
    val id: String,
    val userId: String,
    val createdAt: String? = null,
    val startingBalance: String,
    val accountName: String
)

@Serializable
data class AccountSummary(
    val account: AccountInfo,
    val expenses: Double,
    val selfTransfers: Double,
    val outsideTransactions: Double,
    val friendTransactions: Double,
    val totalTransfers: Double,
    val startingBalance: Double,
    val finalBalance: Double
)

@Serializable
data class FriendTransferSummary(
    val paidByFriend: Double,
    val splits: Double,
    val friendTransactions: Double,
    val totalTransfers: Double,
    val startingBalance: Double,
    val finalBalance: Double
)

@Serializable
data class FriendInfo(
    val id: String,
    val userId: String,
    val createdAt: String? = null,
    val name: String
)

@Serializable
data class FriendSummary(
    val friend: FriendInfo,
    val paidByFriend: Double,
    val splits: Double,
    val friendTransactions: Double,
    val totalTransfers: Double,
    val startingBalance: Double,
    val finalBalance: Double
)

@Serializable
data class SummaryResponse(
    val myExpensesTotal: Double,
    val accountsSummaryData: List<AccountSummary>,
    val friendsSummaryData: List<FriendSummary>,
    val aggregatedAccountsSummaryData: AccountTransferSummary,
    val aggregatedFriendsSummaryData: FriendTransferSummary
)
