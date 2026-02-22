package com.jainhardik120.expensetracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import com.jainhardik120.expensetracker.auth.AuthState
import com.jainhardik120.expensetracker.ui.MainApp
import com.jainhardik120.expensetracker.ui.auth.AuthViewModel
import com.jainhardik120.expensetracker.ui.auth.ErrorScreen
import com.jainhardik120.expensetracker.ui.auth.LoadingScreen
import com.jainhardik120.expensetracker.ui.auth.LoginScreen
import com.jainhardik120.expensetracker.ui.theme.ExpenseTrackerTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ExpenseTrackerTheme {
                val vm: AuthViewModel = hiltViewModel()

                val loginLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.StartActivityForResult()
                ) { result ->
                    result.data?.let {
                        vm.onAuthEvent(it)
                    }
                }

                when (val s = vm.state.collectAsState().value) {
                    is AuthState.SignedOut -> Scaffold(modifier = Modifier.fillMaxSize()) { _ ->
                        LoginScreen(
                            onLogin = { loginLauncher.launch(vm.loginIntent()) }
                        )
                    }

                    is AuthState.Loading -> Scaffold(modifier = Modifier.fillMaxSize()) { _ ->
                        LoadingScreen()
                    }

                    is AuthState.Error -> Scaffold(modifier = Modifier.fillMaxSize()) { _ ->
                        ErrorScreen(
                            message = s.message,
                            onRetryLogin = { loginLauncher.launch(vm.loginIntent()) }
                        )
                    }

                    is AuthState.SignedIn -> MainApp(
                        onLogout = vm::logout
                    )
                }
            }
        }
    }
}