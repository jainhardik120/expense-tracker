package com.jainhardik120.expensetracker.data.entity

import java.time.LocalDate

data class StatementFilters(
    val from: LocalDate? = null,
    val to: LocalDate? = null,
    val kinds: Set<String> = emptySet(),
    val accounts: Set<String> = emptySet(),
    val categories: Set<String> = emptySet(),
    val tags: Set<String> = emptySet()
) {
    val activeCount: Int
        get() = listOf(
            from != null || to != null,
            kinds.isNotEmpty(),
            accounts.isNotEmpty(),
            categories.isNotEmpty(),
            tags.isNotEmpty()
        ).count { it }

    val isEmpty: Boolean get() = activeCount == 0
}
