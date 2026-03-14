package com.jainhardik120.expensetracker

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
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
                    is AuthState.SignedOut -> Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                        Box(modifier = Modifier.padding(innerPadding)) {
                            LoginScreen(
                                onLogin = { loginLauncher.launch(vm.loginIntent()) }
                            )
                        }
                    }

                    is AuthState.Loading -> Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                        Box(modifier = Modifier.padding(innerPadding)) {
                            LoadingScreen()
                        }
                    }

                    is AuthState.Error -> Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                        Box(modifier = Modifier.padding(innerPadding)) {
                            ErrorScreen(
                                message = s.message,
                                onRetryLogin = { loginLauncher.launch(vm.loginIntent()) }
                            )
                        }
                    }

                    is AuthState.SignedIn -> PermissionGate(activity = this@MainActivity) {
                        MainApp(onLogout = vm::logout)
                    }
                }
            }
        }
    }
}

@Composable
private fun PermissionGate(
    activity: ComponentActivity,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val requiredPermissions = remember { buildRequiredPermissions() }
    var requestAttempted by rememberSaveable { mutableStateOf(false) }
    var permissionsVersion by remember { mutableIntStateOf(0) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        requestAttempted = true
        permissionsVersion++
    }
    val settingsLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        permissionsVersion++
    }

    val missingPermissions = remember(permissionsVersion) {
        requiredPermissions.filterNot(context::hasPermission)
    }

    if (missingPermissions.isEmpty()) {
        content()
        return
    }

    val permanentlyDenied = requestAttempted && missingPermissions.any {
        !activity.shouldShowRequestPermissionRationale(it)
    }

    LaunchedEffect(missingPermissions, requestAttempted) {
        if (missingPermissions.isNotEmpty() && !requestAttempted) {
            requestAttempted = true
            permissionLauncher.launch(missingPermissions.toTypedArray())
        }
    }

    PermissionRequiredScreen(
        permanentlyDenied = permanentlyDenied,
        showNotificationPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU,
        onGrantPermissions = {
            permissionLauncher.launch(missingPermissions.toTypedArray())
        },
        onOpenSettings = {
            settingsLauncher.launch(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", context.packageName, null)
                )
            )
        }
    )
}

@Composable
private fun PermissionRequiredScreen(
    permanentlyDenied: Boolean,
    showNotificationPermission: Boolean,
    onGrantPermissions: () -> Unit,
    onOpenSettings: () -> Unit
) {
    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Permissions required",
                style = MaterialTheme.typography.headlineSmall
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = buildString {
                    append(
                        "Expense Tracker needs SMS permissions to capture transaction messages automatically."
                    )
                    if (showNotificationPermission) {
                        append(" Notification permission is also required so the app can alert you when a transaction is detected or when syncing fails.")
                    }
                },
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(modifier = Modifier.height(20.dp))
            if (permanentlyDenied) {
                Text(
                    text = "One or more permissions were denied permanently. Open app settings to enable them.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(12.dp))
                Button(onClick = onOpenSettings) {
                    Text("Open Settings")
                }
            } else {
                Button(onClick = onGrantPermissions) {
                    Text("Grant Permissions")
                }
            }
        }
    }
}

private fun buildRequiredPermissions(): List<String> = buildList {
    add(Manifest.permission.READ_SMS)
    add(Manifest.permission.RECEIVE_SMS)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        add(Manifest.permission.POST_NOTIFICATIONS)
    }
}

private fun Context.hasPermission(permission: String): Boolean {
    return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
}
