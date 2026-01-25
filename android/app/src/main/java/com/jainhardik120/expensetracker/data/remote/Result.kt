package com.jainhardik120.expensetracker.data.remote

import io.ktor.http.HttpStatusCode

sealed class Result<T, R>(val data:T?=null, val errorMessage : String?=null, val errorBody : R?=null, val statusCode : HttpStatusCode?=null){
    class Success<T, R>(data: T) : Result<T, R>(data = data)
    class ClientException<T, R>(errorBody: R? = null, statusCode: HttpStatusCode):
        Result<T, R>(errorBody = errorBody, statusCode = statusCode)
    class Exception<T,R>(message : String?) : Result<T, R>(errorMessage = message)
}