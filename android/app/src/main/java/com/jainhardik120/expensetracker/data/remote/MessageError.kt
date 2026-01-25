package com.jainhardik120.expensetracker.data.remote

import kotlinx.serialization.Serializable

@Serializable
data class MessageError(
    val message: String
)