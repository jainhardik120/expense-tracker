package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.data.entity.AccountItem
import com.jainhardik120.expensetracker.data.entity.CreateSelfTransferBody
import com.jainhardik120.expensetracker.data.entity.CreateStatementBody
import com.jainhardik120.expensetracker.data.entity.FriendItem
import java.time.Instant

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CreateStatementDialog(
    accounts: List<AccountItem>,
    friends: List<FriendItem>,
    isSaving: Boolean,
    onDismiss: () -> Unit,
    onCreateStatement: (CreateStatementBody) -> Unit,
    onCreateSelfTransfer: (CreateSelfTransferBody) -> Unit
) {
    val statementKinds = listOf("expense", "outside_transaction", "friend_transaction", "self_transfer")
    val kindLabels = mapOf(
        "expense" to "Expense",
        "outside_transaction" to "Outside Transaction",
        "friend_transaction" to "Friend Transaction",
        "self_transfer" to "Self Transfer"
    )

    var selectedKind by remember { mutableStateOf("expense") }
    var amount by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var selectedAccountId by remember { mutableStateOf<String?>(null) }
    var selectedFriendId by remember { mutableStateOf<String?>(null) }
    var selectedFromAccountId by remember { mutableStateOf<String?>(null) }
    var selectedToAccountId by remember { mutableStateOf<String?>(null) }
    var amountError by remember { mutableStateOf(false) }
    var categoryError by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { if (!isSaving) onDismiss() },
        title = { Text("Add Transaction") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    statementKinds.forEach { kind ->
                        FilterChip(
                            selected = selectedKind == kind,
                            onClick = { selectedKind = kind },
                            label = { Text(kindLabels[kind] ?: kind) }
                        )
                    }
                }

                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it; amountError = false },
                    label = { Text("Amount") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    isError = amountError,
                    supportingText = if (amountError) {{ Text("Amount is required") }} else null
                )

                if (selectedKind != "self_transfer") {
                    OutlinedTextField(
                        value = category,
                        onValueChange = { category = it; categoryError = false },
                        label = { Text("Category") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        isError = categoryError,
                        supportingText = if (categoryError) {{ Text("Category is required") }} else null
                    )

                    if (selectedKind == "expense" || selectedKind == "outside_transaction" || selectedKind == "friend_transaction") {
                        AccountDropdown(
                            accounts = accounts,
                            selectedId = selectedAccountId,
                            onSelect = { selectedAccountId = it },
                            label = "Account"
                        )
                    }

                    if (selectedKind == "expense" || selectedKind == "friend_transaction") {
                        FriendDropdown(
                            friends = friends,
                            selectedId = selectedFriendId,
                            onSelect = { selectedFriendId = it },
                            label = "Friend"
                        )
                    }
                } else {
                    AccountDropdown(
                        accounts = accounts,
                        selectedId = selectedFromAccountId,
                        onSelect = { selectedFromAccountId = it },
                        label = "From Account"
                    )
                    AccountDropdown(
                        accounts = accounts,
                        selectedId = selectedToAccountId,
                        onSelect = { selectedToAccountId = it },
                        label = "To Account"
                    )
                }

                if (isSaving) {
                    Spacer(modifier = Modifier.height(8.dp))
                    CircularProgressIndicator(modifier = Modifier.padding(start = 8.dp))
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (amount.isBlank()) { amountError = true; return@TextButton }
                    val now = Instant.now().toString()
                    if (selectedKind == "self_transfer") {
                        val fromId = selectedFromAccountId ?: return@TextButton
                        val toId = selectedToAccountId ?: return@TextButton
                        onCreateSelfTransfer(
                            CreateSelfTransferBody(
                                fromAccountId = fromId,
                                toAccountId = toId,
                                amount = amount,
                                createdAt = now
                            )
                        )
                    } else {
                        if (category.isBlank()) { categoryError = true; return@TextButton }
                        onCreateStatement(
                            CreateStatementBody(
                                amount = amount,
                                category = category,
                                tags = emptyList(),
                                accountId = selectedAccountId,
                                friendId = selectedFriendId,
                                statementKind = selectedKind,
                                createdAt = now
                            )
                        )
                    }
                },
                enabled = !isSaving
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) {
                Text("Cancel")
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AccountDropdown(
    accounts: List<AccountItem>,
    selectedId: String?,
    onSelect: (String?) -> Unit,
    label: String
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = accounts.find { it.id == selectedId }?.accountName ?: ""

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it }
    ) {
        OutlinedTextField(
            value = selectedName,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            DropdownMenuItem(
                text = { Text("None") },
                onClick = {
                    onSelect(null)
                    expanded = false
                }
            )
            accounts.forEach { account ->
                DropdownMenuItem(
                    text = { Text(account.accountName) },
                    onClick = {
                        onSelect(account.id)
                        expanded = false
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FriendDropdown(
    friends: List<FriendItem>,
    selectedId: String?,
    onSelect: (String?) -> Unit,
    label: String
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = friends.find { it.id == selectedId }?.name ?: ""

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it }
    ) {
        OutlinedTextField(
            value = selectedName,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            DropdownMenuItem(
                text = { Text("None") },
                onClick = {
                    onSelect(null)
                    expanded = false
                }
            )
            friends.forEach { friend ->
                DropdownMenuItem(
                    text = { Text(friend.name) },
                    onClick = {
                        onSelect(friend.id)
                        expanded = false
                    }
                )
            }
        }
    }
}
