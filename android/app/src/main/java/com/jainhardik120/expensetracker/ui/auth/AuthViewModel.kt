package com.jainhardik120.expensetracker.ui.auth

import android.content.Intent
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jainhardik120.expensetracker.auth.AuthEventBus
import com.jainhardik120.expensetracker.auth.AuthRepository
import com.jainhardik120.expensetracker.auth.AuthState
import dagger.hilt.android.lifecycle.HiltViewModel
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.request
import io.ktor.http.HttpMethod
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repo: AuthRepository,
    authEventBus: AuthEventBus,
    private val apiClient: HttpClient
) : ViewModel() {

    val state: StateFlow<AuthState> = repo.state

    val myExpensesTotal = mutableDoubleStateOf(0.0)

    init {
        viewModelScope.launch {
            authEventBus.events.collect { intent ->
                repo.onAuthCallback(intent)
            }
        }
    }

    fun loginIntent(): Intent = repo.authIntent()

    fun logout() = repo.logout()

    fun refresh() {
        viewModelScope.launch { repo.refresh() }
    }

    fun getSummaryData() {
        viewModelScope.launch {
            val res = apiClient.request("https://expense-tracker.hardikja.in/api/external/summary") {
                method = HttpMethod.Get
            }.body<SummaryResponse>()
            myExpensesTotal.doubleValue = res.myExpensesTotal
        }
    }
}

@Serializable
data class SummaryResponse(
    val myExpensesTotal: Double
)