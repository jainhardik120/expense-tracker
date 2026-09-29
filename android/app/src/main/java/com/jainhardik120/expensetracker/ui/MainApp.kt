package com.jainhardik120.expensetracker.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import com.jainhardik120.expensetracker.ui.screens.SettingsScreen
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

data class BottomNavItem(
    val label: String,
    val icon: ImageVector,
    val route: Any
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainApp(onLogout: () -> Unit) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    val bottomNavItems = listOf(
        BottomNavItem("Home", Icons.Default.Home, SummaryRoute),
        BottomNavItem("Statements", Icons.AutoMirrored.Filled.List, StatementsRoute),
        BottomNavItem("Invest", Icons.AutoMirrored.Filled.ShowChart, InvestmentsRoute),
        BottomNavItem("Settings", Icons.Default.Settings, SettingsRoute)
    )

    Scaffold(
        topBar = { TopAppBar(title = { Text("Expense Tracker") }) },
        bottomBar = {
            NavigationBar {
                bottomNavItems.forEach { item ->
                    val selected = currentDestination?.hasRoute(item.route::class) == true
                    NavigationBarItem(
                        icon = { Icon(item.icon, contentDescription = item.label) },
                        label = { Text(item.label) },
                        selected = selected,
                        // The accent is the one thing that says which app this
                        // is, so the current tab wears it.
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                        ),
                        onClick = {
                            navController.navigate(item.route) {
                                popUpTo(navController.graph.startDestinationId) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
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
            composable<SettingsRoute> {
                SettingsScreen(onLogout = onLogout)
            }
        }
    }
}
