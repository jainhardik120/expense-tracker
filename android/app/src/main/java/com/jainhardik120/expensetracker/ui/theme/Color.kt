package com.jainhardik120.expensetracker.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * The website's palette, which is shadcn's zinc neutrals with a rose accent,
 * translated from the oklch values in `web/src/app/globals.css`. Dark mode
 * goes further than the site and sits on true black, which is what an OLED
 * phone wants.
 */

// Rose, the one colour the product uses.
val Rose50 = Color(0xFFFFF1F2)
val Rose100 = Color(0xFFFFE4E6)
val Rose400 = Color(0xFFFB7185)
val Rose500 = Color(0xFFF43F5E)
val Rose600 = Color(0xFFE11D48)
val Rose800 = Color(0xFF9F1239)
val Rose950 = Color(0xFF4C0519)

// Zinc, everything that is not the accent.
val Zinc50 = Color(0xFFFAFAFA)
val Zinc100 = Color(0xFFF4F4F5)
val Zinc200 = Color(0xFFE4E4E7)
val Zinc400 = Color(0xFFA1A1AA)
val Zinc500 = Color(0xFF71717A)
val Zinc700 = Color(0xFF3F3F46)
val Zinc800 = Color(0xFF27272A)
val Zinc900 = Color(0xFF18181B)
val Zinc950 = Color(0xFF09090B)

val PitchBlack = Color(0xFF000000)
val NearBlack = Color(0xFF121214)

val Red400 = Color(0xFFF87171)
val Red600 = Color(0xFFDC2626)

// A gain needs a colour as much as a loss does, and the scheme has no slot for
// one: `error` is the loss, and there is no `success`. Same tailwind greens the
// investments page uses, light and dark.
val Green400 = Color(0xFF4ADE80)
val Green600 = Color(0xFF16A34A)
