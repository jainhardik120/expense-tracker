package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.InputChip
import androidx.compose.material3.InputChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.data.entity.AccountItem
import com.jainhardik120.expensetracker.data.entity.CreateSelfTransferBody
import com.jainhardik120.expensetracker.data.entity.CreateStatementBody
import com.jainhardik120.expensetracker.data.entity.FriendItem
import com.jainhardik120.expensetracker.data.entity.StatementItem
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val SUGGESTION_LIMIT = 8

private val statementKinds = listOf("expense", "outside_transaction", "friend_transaction", "self_transfer")

private val kindLabels = mapOf(
    "expense" to "Expense",
    "outside_transaction" to "Outside Transaction",
    "friend_transaction" to "Friend Transaction",
    "self_transfer" to "Self Transfer"
)

private val dateLabelFormat = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH)
private val timeLabelFormat = DateTimeFormatter.ofPattern("hh:mm a", Locale.ENGLISH)

data class StatementPrefill(
    val amount: String = "",
    val createdAt: String? = null,
    val statementKind: String = "expense",
    val category: String = "",
    val tags: List<String> = emptyList(),
    val accountId: String? = null,
    val fromAccountId: String? = null
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CreateStatementDialog(
    accounts: List<AccountItem>,
    friends: List<FriendItem>,
    categories: List<String>,
    tagSuggestions: List<String>,
    isSaving: Boolean,
    onDismiss: () -> Unit,
    onCreateStatement: (CreateStatementBody) -> Unit,
    onCreateSelfTransfer: (CreateSelfTransferBody) -> Unit,
    existing: StatementItem? = null,
    prefill: StatementPrefill? = null,
    title: String? = null,
    onUpdateStatement: (String, CreateStatementBody) -> Unit = { _, _ -> },
    onUpdateSelfTransfer: (String, CreateSelfTransferBody) -> Unit = { _, _ -> }
) {
    val formKey = existing?.id ?: prefill
    var selectedKind by remember(formKey) {
        mutableStateOf(
            when {
                existing == null -> prefill?.statementKind ?: "expense"
                existing.type == "self_transfer" -> "self_transfer"
                else -> existing.statementKind
            }
        )
    }
    var amount by remember(formKey) {
        mutableStateOf(existing?.amount?.let(::plainAmount) ?: prefill?.amount ?: "")
    }
    var category by remember(formKey) {
        mutableStateOf(existing?.category ?: prefill?.category ?: "")
    }
    var tags by remember(formKey) { mutableStateOf(existing?.tags ?: prefill?.tags ?: emptyList()) }
    var selectedAccountId by remember(formKey) {
        mutableStateOf(existing?.accountId ?: prefill?.accountId)
    }
    var selectedFriendId by remember(formKey) { mutableStateOf(existing?.friendId) }
    var selectedFromAccountId by remember(formKey) {
        mutableStateOf(existing?.fromAccountId ?: prefill?.fromAccountId)
    }
    var selectedToAccountId by remember(formKey) { mutableStateOf(existing?.toAccountId) }
    var occurredAt by remember(formKey) {
        mutableStateOf(parseLocalDateTime(existing?.createdAt ?: prefill?.createdAt))
    }
    var amountError by remember(formKey) { mutableStateOf(false) }
    var categoryError by remember(formKey) { mutableStateOf(false) }
    var accountsError by remember(formKey) { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { if (!isSaving) onDismiss() },
        title = {
            Text(title ?: if (existing == null) "Add Transaction" else "Edit Transaction")
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (existing == null) {
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
                } else {
                    Text(
                        text = kindLabels[selectedKind] ?: selectedKind,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it; amountError = false },
                    label = { Text("Amount") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    isError = amountError,
                    supportingText = if (amountError) {
                        { Text("Enter a valid amount") }
                    } else if (selectedKind == "outside_transaction" || selectedKind == "friend_transaction") {
                        { Text("Negative for money going out") }
                    } else {
                        null
                    }
                )

                DateTimeFields(value = occurredAt, onChange = { occurredAt = it })

                if (selectedKind != "self_transfer") {
                    SuggestionTextField(
                        value = category,
                        onValueChange = { category = it; categoryError = false },
                        suggestions = categories,
                        label = "Category",
                        isError = categoryError,
                        errorText = "Category is required"
                    )

                    TagsField(
                        tags = tags,
                        suggestions = tagSuggestions,
                        onChange = { tags = it }
                    )

                    AccountDropdown(
                        accounts = accounts,
                        selectedId = selectedAccountId,
                        onSelect = { selectedAccountId = it },
                        label = "Account"
                    )

                    if (selectedKind == "expense" || selectedKind == "friend_transaction") {
                        FriendDropdown(
                            friends = friends,
                            selectedId = selectedFriendId,
                            onSelect = { selectedFriendId = it },
                            label = if (selectedKind == "expense") "Paid by friend" else "Friend"
                        )
                    }
                } else {
                    AccountDropdown(
                        accounts = accounts,
                        selectedId = selectedFromAccountId,
                        onSelect = { selectedFromAccountId = it; accountsError = false },
                        label = "From Account",
                        allowNone = false
                    )
                    AccountDropdown(
                        accounts = accounts,
                        selectedId = selectedToAccountId,
                        onSelect = { selectedToAccountId = it; accountsError = false },
                        label = "To Account",
                        allowNone = false
                    )
                    if (accountsError) {
                        Text(
                            text = "Pick two different accounts",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }

                if (isSaving) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val parsedAmount = amount.trim().toDoubleOrNull()
                    if (parsedAmount == null) {
                        amountError = true
                        return@TextButton
                    }
                    val at = occurredAt.toInstant().toString()
                    if (selectedKind == "self_transfer") {
                        val fromId = selectedFromAccountId
                        val toId = selectedToAccountId
                        if (fromId == null || toId == null || fromId == toId) {
                            accountsError = true
                            return@TextButton
                        }
                        val body = CreateSelfTransferBody(
                            fromAccountId = fromId,
                            toAccountId = toId,
                            amount = amount.trim(),
                            createdAt = at
                        )
                        if (existing == null) {
                            onCreateSelfTransfer(body)
                        } else {
                            onUpdateSelfTransfer(existing.id, body)
                        }
                    } else {
                        if (category.isBlank()) {
                            categoryError = true
                            return@TextButton
                        }
                        val body = CreateStatementBody(
                            amount = amount.trim(),
                            category = category.trim(),
                            tags = tags,
                            accountId = selectedAccountId,
                            friendId = selectedFriendId.takeIf {
                                selectedKind == "expense" || selectedKind == "friend_transaction"
                            },
                            statementKind = selectedKind,
                            createdAt = at
                        )
                        if (existing == null) {
                            onCreateStatement(body)
                        } else {
                            onUpdateStatement(existing.id, body)
                        }
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
private fun DateTimeFields(value: ZonedDateTime, onChange: (ZonedDateTime) -> Unit) {
    var showDatePicker by remember { mutableStateOf(false) }
    var showTimePicker by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        OutlinedButton(onClick = { showDatePicker = true }, modifier = Modifier.weight(1f)) {
            Text(dateLabelFormat.format(value))
        }
        OutlinedButton(onClick = { showTimePicker = true }, modifier = Modifier.weight(1f)) {
            Text(timeLabelFormat.format(value))
        }
    }

    if (showDatePicker) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = value.toLocalDate()
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant()
                .toEpochMilli()
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        state.selectedDateMillis?.let { millis ->
                            val date = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                            onChange(value.with(date))
                        }
                        showDatePicker = false
                    }
                ) {
                    Text("OK")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text("Cancel")
                }
            }
        ) {
            DatePicker(state = state)
        }
    }

    if (showTimePicker) {
        val state = rememberTimePickerState(
            initialHour = value.hour,
            initialMinute = value.minute,
            is24Hour = false
        )
        AlertDialog(
            onDismissRequest = { showTimePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        onChange(value.with(LocalTime.of(state.hour, state.minute)))
                        showTimePicker = false
                    }
                ) {
                    Text("OK")
                }
            },
            dismissButton = {
                TextButton(onClick = { showTimePicker = false }) {
                    Text("Cancel")
                }
            },
            text = { TimePicker(state = state) }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SuggestionTextField(
    value: String,
    onValueChange: (String) -> Unit,
    suggestions: List<String>,
    label: String,
    isError: Boolean = false,
    errorText: String? = null,
    showWhenEmpty: Boolean = true,
    onSubmit: (() -> Unit)? = null
) {
    var expanded by remember { mutableStateOf(false) }
    val matches = remember(value, suggestions) {
        val query = value.trim()
        if (query.isEmpty() && !showWhenEmpty) {
            emptyList()
        } else {
            suggestions
                .filter { it.contains(query, ignoreCase = true) && !it.equals(query, ignoreCase = true) }
                .sortedBy { !it.startsWith(query, ignoreCase = true) }
                .take(SUGGESTION_LIMIT)
        }
    }

    ExposedDropdownMenuBox(
        expanded = expanded && matches.isNotEmpty(),
        onExpandedChange = { expanded = it }
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = {
                onValueChange(it)
                expanded = true
            },
            label = { Text(label) },
            singleLine = true,
            isError = isError,
            supportingText = if (isError && errorText != null) {
                { Text(errorText) }
            } else {
                null
            },
            keyboardOptions = KeyboardOptions(imeAction = if (onSubmit != null) ImeAction.Done else ImeAction.Next),
            keyboardActions = KeyboardActions(onDone = { onSubmit?.invoke() }),
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryEditable)
        )
        ExposedDropdownMenu(
            expanded = expanded && matches.isNotEmpty(),
            onDismissRequest = { expanded = false }
        ) {
            matches.forEach { suggestion ->
                DropdownMenuItem(
                    text = { Text(suggestion, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    onClick = {
                        onValueChange(suggestion)
                        expanded = false
                        onSubmit?.invoke()
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagsField(
    tags: List<String>,
    suggestions: List<String>,
    onChange: (List<String>) -> Unit
) {
    var draft by remember { mutableStateOf("") }
    val available = remember(tags, suggestions) { suggestions.filterNot { it in tags } }

    fun addDraft(value: String = draft) {
        val tag = value.trim()
        if (tag.isNotEmpty() && tags.none { it.equals(tag, ignoreCase = true) }) {
            onChange(tags + tag)
        }
        draft = ""
    }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        SuggestionTextField(
            value = draft,
            onValueChange = { draft = it },
            suggestions = available,
            label = "Add tag",
            showWhenEmpty = false,
            onSubmit = { addDraft() }
        )
        if (tags.isNotEmpty()) {
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                tags.forEach { tag ->
                    InputChip(
                        selected = false,
                        onClick = { onChange(tags - tag) },
                        label = { Text(tag) },
                        trailingIcon = {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Remove $tag",
                                modifier = Modifier.size(InputChipDefaults.IconSize)
                            )
                        }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AccountDropdown(
    accounts: List<AccountItem>,
    selectedId: String?,
    onSelect: (String?) -> Unit,
    label: String,
    allowNone: Boolean = true
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
            if (allowNone) {
                DropdownMenuItem(
                    text = { Text("None") },
                    onClick = {
                        onSelect(null)
                        expanded = false
                    }
                )
            }
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

private fun parseLocalDateTime(iso: String?): ZonedDateTime {
    val zone = ZoneId.systemDefault()
    if (iso == null) {
        return ZonedDateTime.now(zone).withSecond(0).withNano(0)
    }
    return runCatching { Instant.parse(iso).atZone(zone) }
        .recoverCatching { LocalDate.parse(iso.take(10)).atStartOfDay(zone) }
        .getOrElse { ZonedDateTime.now(zone).withSecond(0).withNano(0) }
}

private fun plainAmount(value: String): String =
    value.toBigDecimalOrNull()?.stripTrailingZeros()?.toPlainString() ?: value
