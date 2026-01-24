package com.jainhardik120.expensetracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import com.jainhardik120.expensetracker.auth.AuthEventBus
import com.jainhardik120.expensetracker.auth.AuthState
import com.jainhardik120.expensetracker.ui.auth.AuthViewModel
import com.jainhardik120.expensetracker.ui.auth.ErrorScreen
import com.jainhardik120.expensetracker.ui.auth.HomeScreen
import com.jainhardik120.expensetracker.ui.auth.LoadingScreen
import com.jainhardik120.expensetracker.ui.auth.LoginScreen
import com.jainhardik120.expensetracker.ui.theme.ExpenseTrackerTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject
    lateinit var authEventBus: AuthEventBus
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ExpenseTrackerTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    Column(Modifier.padding(innerPadding)) {
                        val vm: AuthViewModel = hiltViewModel()

                        val loginLauncher = rememberLauncherForActivityResult(
                            contract = ActivityResultContracts.StartActivityForResult()
                        ) { result ->
                            result.data?.let {
                                authEventBus.emit(it)
                            }
                        }

                        when (val s = vm.state.collectAsState().value) {
                            is AuthState.SignedOut -> LoginScreen(
                                onLogin = { loginLauncher.launch(vm.loginIntent()) }
                            )

                            is AuthState.Loading -> LoadingScreen()
                            is AuthState.Error -> ErrorScreen(
                                message = s.message,
                                onRetryLogin = { loginLauncher.launch(vm.loginIntent()) }
                            )

                            is AuthState.SignedIn -> HomeScreen(
                                onLogout = vm::logout,
                                vm
                            )
                        }
                    }
                }
            }
        }
    }
}