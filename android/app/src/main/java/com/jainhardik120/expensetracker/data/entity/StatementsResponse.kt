package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

@Serializable
data class RowsCount(
    val statementCount: Int,
    val selfTransferStatementCount: Int
)

@Serializable
data class StatementsResponse(
    val statements: List<StatementItem>,
    val pageCount: Int,
    val rowsCount: RowsCount
)
