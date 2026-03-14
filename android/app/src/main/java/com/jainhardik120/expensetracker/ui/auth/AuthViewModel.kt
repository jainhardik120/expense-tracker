package com.jainhardik120.expensetracker.ui.auth

import android.content.Intent
import androidx.lifecycle.viewModelScope
import com.jainhardik120.expensetracker.auth.AuthRepository
import com.jainhardik120.expensetracker.auth.AuthState
import com.jainhardik120.expensetracker.ui.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repo: AuthRepository
) : BaseViewModel() {

    val state: StateFlow<AuthState> = repo.state

    fun onAuthEvent(intent: Intent) {
        viewModelScope.launch {
            repo.onAuthCallback(intent)
        }
    }

    fun loginIntent(): Intent = repo.authIntent()

    fun logout() = repo.logout()
}
