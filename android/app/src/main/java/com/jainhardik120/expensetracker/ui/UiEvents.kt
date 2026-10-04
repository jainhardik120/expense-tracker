package com.jainhardik120.expensetracker.ui

import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.staticCompositionLocalOf

val LocalSnackbarHostState = staticCompositionLocalOf { SnackbarHostState() }

@Composable
fun CollectUiEvents(viewModel: BaseViewModel) {
    val snackbarHostState = LocalSnackbarHostState.current
    LaunchedEffect(viewModel) {
        viewModel.uiEvent.collect { event ->
            when (event) {
                is UiEvent.ShowSnackBar -> snackbarHostState.showSnackbar(
                    message = event.message,
                    actionLabel = event.action
                )
            }
        }
    }
}
