package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.jainhardik120.expensetracker.data.entity.AccountItem
import com.jainhardik120.expensetracker.data.entity.CreateStatementBody
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AmountSignTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun plusMinusFlipsTheSignAndSavesANegativeAmount() {
        var saved: CreateStatementBody? = null
        compose.setContent {
            CreateStatementDialog(
                accounts = listOf(AccountItem("acc", "user", "0", "Axis")),
                friends = emptyList(),
                categories = listOf("Bank Charges"),
                tagSuggestions = emptyList(),
                isSaving = false,
                onDismiss = {},
                onCreateStatement = { saved = it },
                onCreateSelfTransfer = {},
                prefill = StatementPrefill(
                    statementKind = "outside_transaction",
                    category = "Bank Charges",
                    accountId = "acc"
                )
            )
        }
        compose.onNode(hasSetTextAction() and androidx.compose.ui.test.hasText("Amount")).performTextReplacement("250")
        compose.onNodeWithText("±").assertIsDisplayed().performClick()
        compose.onNodeWithText("-250").assertIsDisplayed()
        compose.onNodeWithText("±").performClick()
        compose.onNodeWithText("250").assertIsDisplayed()
        compose.onNodeWithText("±").performClick()
        compose.onNodeWithText("Save").performClick()
        compose.waitForIdle()
        assertEquals("-250", saved?.amount)
        assertEquals("outside_transaction", saved?.statementKind)
    }

    @Test
    fun expensesHaveNoPlusMinus() {
        compose.setContent {
            CreateStatementDialog(
                accounts = listOf(AccountItem("acc", "user", "0", "Axis")),
                friends = emptyList(),
                categories = emptyList(),
                tagSuggestions = emptyList(),
                isSaving = false,
                onDismiss = {},
                onCreateStatement = {},
                onCreateSelfTransfer = {}
            )
        }
        compose.onNodeWithText("Expense").assertIsDisplayed()
        assertEquals(0, compose.onAllNodes(androidx.compose.ui.test.hasText("±")).fetchSemanticsNodes().size)
    }
}
