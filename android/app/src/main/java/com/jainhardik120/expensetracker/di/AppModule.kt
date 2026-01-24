package com.jainhardik120.expensetracker.di

import com.jainhardik120.expensetracker.auth.AuthRepository
import com.jainhardik120.expensetracker.auth.createHttpClient
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.ktor.client.HttpClient
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideHttpClient(authRepo: AuthRepository): HttpClient {
        return createHttpClient(authRepo)
    }
}
