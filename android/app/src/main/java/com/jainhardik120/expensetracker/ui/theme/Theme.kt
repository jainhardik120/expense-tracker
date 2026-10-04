package com.jainhardik120.expensetracker.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColors = darkColorScheme(
    primary = Rose500,
    onPrimary = Rose50,
    primaryContainer = Rose950,
    onPrimaryContainer = Rose100,
    secondary = Zinc800,
    onSecondary = Zinc50,
    secondaryContainer = Zinc800,
    onSecondaryContainer = Zinc50,
    tertiary = Rose400,
    onTertiary = Zinc950,
    background = PitchBlack,
    onBackground = Zinc50,
    surface = PitchBlack,
    onSurface = Zinc50,
    surfaceVariant = Zinc800,
    onSurfaceVariant = Zinc400,
    surfaceContainerLowest = PitchBlack,
    surfaceContainerLow = NearBlack,
    surfaceContainer = Zinc900,
    surfaceContainerHigh = Zinc800,
    surfaceContainerHighest = Zinc800,
    outline = Zinc700,
    outlineVariant = Zinc800,
    error = Red400,
    onError = Zinc950,
    errorContainer = Rose950,
    onErrorContainer = Rose100
)

private val LightColors = lightColorScheme(
    primary = Rose600,
    onPrimary = Rose50,
    primaryContainer = Rose100,
    onPrimaryContainer = Rose800,
    secondary = Zinc100,
    onSecondary = Zinc950,
    secondaryContainer = Zinc100,
    onSecondaryContainer = Zinc950,
    tertiary = Rose500,
    onTertiary = Rose50,
    background = Color.White,
    onBackground = Zinc950,
    surface = Color.White,
    onSurface = Zinc950,
    surfaceVariant = Zinc100,
    onSurfaceVariant = Zinc500,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Zinc50,
    surfaceContainer = Zinc100,
    surfaceContainerHigh = Zinc200,
    surfaceContainerHighest = Zinc200,
    outline = Zinc200,
    outlineVariant = Zinc100,
    error = Red600,
    onError = Color.White,
    errorContainer = Rose100,
    onErrorContainer = Rose800
)

@Composable
fun ExpenseTrackerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography,
        content = content
    )
}
