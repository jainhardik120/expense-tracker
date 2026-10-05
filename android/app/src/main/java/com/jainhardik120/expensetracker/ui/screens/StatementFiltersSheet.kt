package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.data.entity.AccountItem
import com.jainhardik120.expensetracker.data.entity.FriendItem
import com.jainhardik120.expensetracker.data.entity.StatementFilters
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private val filterDateFormat = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH)

private val filterKinds = listOf(
    "expense" to "Expense",
    "outside_transaction" to "Outside",
    "friend_transaction" to "Friend",
    "self_transfer" to "Self transfer"
)

private enum class DateField { From, To }

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun StatementFiltersSheet(
    initial: StatementFilters,
    accounts: List<AccountItem>,
    friends: List<FriendItem>,
    categories: List<String>,
    tagSuggestions: List<String>,
    onApply: (StatementFilters) -> Unit,
    onDismiss: () -> Unit
) {
    var draft by remember(initial) { mutableStateOf(initial) }
    var editingDate by remember { mutableStateOf<DateField?>(null) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val today = remember { LocalDate.now() }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().imePadding()) {
            Column(
                modifier = Modifier
                    .weight(1f, fill = false)
                    .verticalScroll(rememberScrollState())
                    .padding(start = 24.dp, end = 24.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Filters",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f)
                    )
                    if (!draft.isEmpty) {
                        TextButton(onClick = { draft = StatementFilters() }) {
                            Text("Clear all")
                        }
                    }
                }

                FilterSection("Date") {
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val presets = listOf(
                            "This month" to (today.withDayOfMonth(1) to today),
                            "Last month" to today.minusMonths(1).let {
                                it.withDayOfMonth(1) to it.withDayOfMonth(it.lengthOfMonth())
                            },
                            "Last 30 days" to (today.minusDays(29) to today)
                        )
                        presets.forEach { (label, range) ->
                            FilterChip(
                                selected = draft.from == range.first && draft.to == range.second,
                                onClick = {
                                    draft = if (draft.from == range.first && draft.to == range.second) {
                                        draft.copy(from = null, to = null)
                                    } else {
                                        draft.copy(from = range.first, to = range.second)
                                    }
                                },
                                label = { Text(label) }
                            )
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = { editingDate = DateField.From },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(draft.from?.let(filterDateFormat::format) ?: "From")
                        }
                        OutlinedButton(
                            onClick = { editingDate = DateField.To },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(draft.to?.let(filterDateFormat::format) ?: "To")
                        }
                    }
                }

                FilterSection("Type") {
                    ChipGroup(
                        options = filterKinds,
                        selected = draft.kinds,
                        onToggle = { draft = draft.copy(kinds = draft.kinds.toggle(it)) }
                    )
                }

                if (accounts.isNotEmpty()) {
                    FilterSection("Accounts") {
                        ChipGroup(
                            options = accounts.map { it.id to it.accountName },
                            selected = draft.accounts,
                            onToggle = { draft = draft.copy(accounts = draft.accounts.toggle(it)) }
                        )
                    }
                }

                if (friends.isNotEmpty()) {
                    FilterSection("Friends") {
                        ChipGroup(
                            options = friends.map { it.id to it.name },
                            selected = draft.accounts,
                            onToggle = { draft = draft.copy(accounts = draft.accounts.toggle(it)) }
                        )
                    }
                }

                if (categories.isNotEmpty()) {
                    FilterSection("Categories") {
                        ChipGroup(
                            options = categories.map { it to it },
                            selected = draft.categories,
                            onToggle = { draft = draft.copy(categories = draft.categories.toggle(it)) }
                        )
                    }
                }

                FilterSection("Tags") {
                    TagsField(
                        tags = draft.tags.toList(),
                        suggestions = tagSuggestions,
                        onChange = { draft = draft.copy(tags = it.toSet()) },
                        label = "Search tags"
                    )
                }

            }
            HorizontalDivider()
            Button(
                onClick = { onApply(draft) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 12.dp)
                    .height(52.dp)
            ) {
                Text(if (draft.isEmpty) "Show all statements" else "Apply filters")
            }
        }
    }

    editingDate?.let { field ->
        val current = if (field == DateField.From) draft.from else draft.to
        val state = rememberDatePickerState(
            initialSelectedDateMillis = (current ?: today)
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant()
                .toEpochMilli()
        )
        DatePickerDialog(
            onDismissRequest = { editingDate = null },
            confirmButton = {
                TextButton(
                    onClick = {
                        val picked = state.selectedDateMillis?.let {
                            Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                        }
                        draft = if (field == DateField.From) {
                            draft.copy(from = picked, to = draft.to?.takeIf { picked == null || !it.isBefore(picked) })
                        } else {
                            draft.copy(to = picked, from = draft.from?.takeIf { picked == null || !it.isAfter(picked) })
                        }
                        editingDate = null
                    }
                ) {
                    Text("OK")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        draft = if (field == DateField.From) draft.copy(from = null) else draft.copy(to = null)
                        editingDate = null
                    }
                ) {
                    Text("Clear")
                }
            }
        ) {
            DatePicker(state = state)
        }
    }
}

@Composable
private fun FilterSection(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        content()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipGroup(
    options: List<Pair<String, String>>,
    selected: Set<String>,
    onToggle: (String) -> Unit
) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        options.forEach { (value, label) ->
            FilterChip(
                selected = value in selected,
                onClick = { onToggle(value) },
                label = { Text(label) }
            )
        }
    }
}

private fun Set<String>.toggle(value: String): Set<String> =
    if (value in this) this - value else this + value
