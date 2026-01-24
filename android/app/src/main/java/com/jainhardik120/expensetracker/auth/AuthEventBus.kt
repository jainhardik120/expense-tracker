package com.jainhardik120.expensetracker.auth

import android.content.Intent
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthEventBus @Inject constructor() {
    private val _events = MutableSharedFlow<Intent>(extraBufferCapacity = 1)
    val events: SharedFlow<Intent> = _events

    fun emit(intent: Intent) {
        _events.tryEmit(intent)
    }
}
