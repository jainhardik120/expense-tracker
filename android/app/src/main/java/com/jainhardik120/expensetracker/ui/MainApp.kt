package com.jainhardik120.expensetracker.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.jainhardik120.expensetracker.ui.screens.InvestmentsScreen
import com.jainhardik120.expensetracker.ui.screens.InvestmentsViewModel
import com.jainhardik120.expensetracker.AppDestination
import com.jainhardik120.expensetracker.ui.screens.SettingsScreen
import com.jainhardik120.expensetracker.ui.screens.SmsNotificationsScreen
import com.jainhardik120.expensetracker.ui.screens.SmsNotificationsViewModel
import com.jainhardik120.expensetracker.ui.screens.StatementsScreen
import com.jainhardik120.expensetracker.ui.screens.StatementsViewModel
import com.jainhardik120.expensetracker.ui.screens.SummaryScreen
import com.jainhardik120.expensetracker.ui.screens.SummaryViewModel
import kotlinx.serialization.Serializable

@Serializable
object SummaryRoute

@Serializable
object StatementsRoute

@Serializable
object InvestmentsRoute

@Serializable
object SettingsRoute

@Serializable
object SmsRoute

data class BottomNavItem(
    val label: String,
    val icon: ImageVector,
    val route: Any
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainApp(
    onLogout: () -> Unit,
    requestedDestination: String? = null,
    onDestinationHandled: () -> Unit = {}
) {
    val navController = rememberNavController()
    val snackbarHostState = remember { SnackbarHostState() }
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    val bottomNavItems = listOf(
        BottomNavItem("Home", Icons.Default.Home, SummaryRoute),
        BottomNavItem("Statements", Icons.AutoMirrored.Filled.List, StatementsRoute),
        BottomNavItem("Invest", Icons.AutoMirrored.Filled.ShowChart, InvestmentsRoute),
        BottomNavItem("SMS", Icons.Default.Sms, SmsRoute),
        BottomNavItem("Settings", Icons.Default.Settings, SettingsRoute)
    )

    fun navigateTo(route: Any) {
        navController.navigate(route) {
            popUpTo(navController.graph.startDestinationId) {
                saveState = true
            }
            launchSingleTop = true
            restoreState = true
        }
    }

    LaunchedEffect(requestedDestination) {
        val route = when (requestedDestination) {
            AppDestination.INVESTMENTS -> InvestmentsRoute
            AppDestination.SMS -> SmsRoute
            else -> null
        }
        if (route != null) {
            navigateTo(route)
            onDestinationHandled()
        }
    }

    CompositionLocalProvider(LocalSnackbarHostState provides snackbarHostState) {
        Scaffold(
            topBar = { TopAppBar(title = { Text("Expense Tracker") }) },
            snackbarHost = { SnackbarHost(snackbarHostState) },
            bottomBar = {
                NavigationBar {
                    bottomNavItems.forEach { item ->
                        val selected = currentDestination?.hasRoute(item.route::class) == true
                        NavigationBarItem(
                            icon = { Icon(item.icon, contentDescription = item.label) },
                            label = { Text(item.label) },
                            selected = selected,
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                                indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                            ),
                            onClick = { navigateTo(item.route) }
                        )
                    }
                }
            }
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = SummaryRoute,
                modifier = Modifier.padding(innerPadding)
            ) {
                composable<SummaryRoute> {
                    val viewModel: SummaryViewModel = hiltViewModel()
                    SummaryScreen(viewModel = viewModel)
                }
                composable<StatementsRoute> {
                    val viewModel: StatementsViewModel = hiltViewModel()
                    StatementsScreen(viewModel = viewModel)
                }
                composable<InvestmentsRoute> {
                    val viewModel: InvestmentsViewModel = hiltViewModel()
                    InvestmentsScreen(viewModel = viewModel)
                }
                composable<SmsRoute> {
                    val viewModel: SmsNotificationsViewModel = hiltViewModel()
                    SmsNotificationsScreen(viewModel = viewModel)
                }
                composable<SettingsRoute> {
                    SettingsScreen(onLogout = onLogout)
                }
            }
        }
    }
}
