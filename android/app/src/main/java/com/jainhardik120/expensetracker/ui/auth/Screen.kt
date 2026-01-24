package com.jainhardik120.expensetracker.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.auth.AuthConfig

@Composable
fun LoginScreen(onLogin: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Client ID : ${AuthConfig.CLIENT_ID}")
        Button(onClick = onLogin) { Text("Login") }
    }
}

@Composable
fun LoadingScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
fun ErrorScreen(message: String, onRetryLogin: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Auth error: $message")
        Spacer(Modifier.height(12.dp))
        Button(onClick = onRetryLogin) { Text("Try again") }
    }
}

@Composable
fun HomeScreen(onLogout: () -> Unit, vm: AuthViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Logged in ✅")
        Text("My Expenses Total: $${vm.myExpensesTotal.doubleValue}")
        Spacer(Modifier.height(12.dp))
        Button(onClick = onLogout) { Text("Logout") }
        Button(onClick = vm::getSummaryData) {
            Text("Refresh Summary Data")
        }
    }
}
