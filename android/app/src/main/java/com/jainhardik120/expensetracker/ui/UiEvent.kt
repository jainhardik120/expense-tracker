package com.jainhardik120.expensetracker.ui

sealed class UiEvent {
    data class ShowSnackBar(
        val message: String,
        val action: String? = null
    ) : UiEvent()

    data class ShowToast(val message: String) : UiEvent()
    data object NavigateBack : UiEvent()
}