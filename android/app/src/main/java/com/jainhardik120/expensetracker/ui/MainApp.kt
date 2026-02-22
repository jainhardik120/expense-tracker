package com.jainhardik120.expensetracker.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
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
object SettingsRoute

data class BottomNavItem(
    val label: String,
    val icon: ImageVector,
    val route: Any
)

@Composable
fun MainApp(onLogout: () -> Unit) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    val bottomNavItems = listOf(
        BottomNavItem("Home", Icons.Default.Home, SummaryRoute),
        BottomNavItem("Statements", Icons.AutoMirrored.Filled.List, StatementsRoute),
        BottomNavItem("Settings", Icons.Default.Settings, SettingsRoute)
    )

    Scaffold(
        bottomBar = {
            NavigationBar {
                bottomNavItems.forEach { item ->
                    val selected = currentDestination?.hasRoute(item.route::class) == true
                    NavigationBarItem(
                        icon = { Icon(item.icon, contentDescription = item.label) },
                        label = { Text(item.label) },
                        selected = selected,
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
            composable<SettingsRoute> {
                SettingsScreen(onLogout = onLogout)
            }
        }
    }
}
