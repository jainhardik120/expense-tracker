package com.jainhardik120.expensetracker.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import androidx.core.content.edit

class TokenStore @Inject constructor(
    @ApplicationContext context: Context
) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "auth_tokens",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun save(tokens: TokenSet) {
        prefs.edit {
            putString("access_token", tokens.accessToken)
                .putString("refresh_token", tokens.refreshToken)
                .putString("id_token", tokens.idToken)
                .putLong("expires_at", tokens.expiresAtEpochSec)
        }
    }

    fun load(): TokenSet? {
        val access = prefs.getString("access_token", null) ?: return null
        val refresh = prefs.getString("refresh_token", null)
        val idToken = prefs.getString("id_token", null)
        val exp = prefs.getLong("expires_at", 0L)
        return TokenSet(access, refresh, idToken, exp)
    }

    fun clear() {
        prefs.edit { clear() }
    }
}
