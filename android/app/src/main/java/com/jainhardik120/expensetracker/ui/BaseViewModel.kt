package com.jainhardik120.expensetracker.ui

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jainhardik120.expensetracker.data.entity.MessageError
import com.jainhardik120.expensetracker.data.entity.Result
import com.jainhardik120.expensetracker.ui.UiEvent
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

abstract class BaseViewModel : ViewModel() {

    companion object {
        private const val TAG = "BaseViewModel"
    }

    private val _uiEvent = Channel<UiEvent>()
    val uiEvent = _uiEvent.receiveAsFlow()


    protected fun sendUiEvent(event: UiEvent) {
        viewModelScope.launch {
            _uiEvent.send(event)
        }
    }

    open fun onTextException(message: String) {
        sendUiEvent(UiEvent.ShowSnackBar(message))
    }

    open fun apiPreExecuting() {

    }

    open fun apiDoneExecuting() {

    }

    protected fun <T, R> makeApiCall(
        call: suspend () -> Result<T, R>,
        preExecuting: (() -> Unit)? = { apiPreExecuting() },
        onDoneExecuting: (() -> Unit)? = {
            apiDoneExecuting()
        },
        onException: (String) -> Unit = { errorMessage ->
            Log.e(TAG, "makeApiCall: $errorMessage")
            onTextException(errorMessage)
        },
        onError: (R) -> Unit = { errorBody ->
            if (errorBody is MessageError) {
                onException(errorBody.message)
            }
        },
        onSuccess: (T) -> Unit
    ) {
        viewModelScope.launch {
            preExecuting?.invoke()
            val result = call.invoke()
            onDoneExecuting?.invoke()
            when (result) {
                is Result.ClientException -> {
                    result.errorBody?.let(onError)
                }

                is Result.Exception -> {
                    result.errorMessage?.let(onException)
                }

                is Result.Success -> {
                    result.data?.let(onSuccess)
                }
            }
        }
    }
}