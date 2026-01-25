package com.jainhardik120.expensetracker.ui.auth

import android.content.Intent
import android.util.Log
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jainhardik120.expensetracker.auth.AuthRepository
import com.jainhardik120.expensetracker.auth.AuthState
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.data.remote.SMSNotificationBody
import com.jainhardik120.expensetracker.parser.core.TransactionType
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
    private val repo: AuthRepository, private val api: ExpenseTrackerAPI
) : BaseViewModel() {

    val state: StateFlow<AuthState> = repo.state

    fun onAuthEvent(intent: Intent) {
        viewModelScope.launch {
            repo.onAuthCallback(intent)
        }
    }

    fun loginIntent(): Intent = repo.authIntent()

    fun logout() = repo.logout()

    fun createDummyRequest() {
        makeApiCall(
            call = {
                api.sendNotification(
                    SMSNotificationBody(
                        amount = 1500.0f.toString(),
                        type = "transfer",
                        merchant = "Dummy Merchant",
                        reference = "Dummy Reference",
                        accountLast4 = "1234",
                        smsBody = "Dummy SMS Body",
                        sender = "Dummy Sender",
                        timestamp = System.currentTimeMillis(),
                        bankName = "Dummy Bank",
                        isFromCard = false
                    )
                )
            }) {
            Log.d("TAG", "createDummyRequest: $it")
        }
    }
}
