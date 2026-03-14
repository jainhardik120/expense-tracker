package com.jainhardik120.expensetracker.ui

sealed class UiEvent {
    data class ShowSnackBar(
        val message: String,
        val action: String? = null
    ) : UiEvent()
}
