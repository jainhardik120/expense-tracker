package com.jainhardik120.expensetracker.ui.auth

import android.content.Intent
import android.util.Log
import androidx.lifecycle.viewModelScope
import com.jainhardik120.expensetracker.auth.AuthRepository
import com.jainhardik120.expensetracker.auth.AuthState
import com.jainhardik120.expensetracker.data.remote.ExpenseTrackerAPI
import com.jainhardik120.expensetracker.data.entity.SMSNotificationBody
import com.jainhardik120.expensetracker.ui.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
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

    fun refresh(){
        viewModelScope.launch {
            repo.refresh()
        }
    }
}
