package com.jainhardik120.expensetracker.data.entity

import kotlinx.serialization.Serializable

@Serializable
data class TimelineDay(
    val date: String,
    val count: Int
)
