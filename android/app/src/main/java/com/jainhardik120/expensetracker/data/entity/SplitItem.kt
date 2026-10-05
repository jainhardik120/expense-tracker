package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

@Serializable
data class SplitItem(
    val id: String,
    val statementId: String,
    val friendId: String,
    val amount: String
)

@Serializable
data class SplitFields(
    val friendId: String,
    val amount: String
)

@Serializable
data class SplitBody(
    val createSplitSchema: SplitFields
)

@Serializable
data class BulkSplitFields(
    val friendId: String,
    val percentage: String
)

@Serializable
data class BulkSplitBody(
    val statementIds: List<String>,
    val bulkSplitSchema: BulkSplitFields
)
