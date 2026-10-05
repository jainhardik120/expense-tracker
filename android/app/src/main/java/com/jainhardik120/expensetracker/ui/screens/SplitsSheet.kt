package com.jainhardik120.expensetracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.jainhardik120.expensetracker.data.entity.FriendItem
import com.jainhardik120.expensetracker.data.entity.SplitItem
import com.jainhardik120.expensetracker.data.entity.StatementItem
import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SplitsSheet(
    statement: StatementItem,
    splits: List<SplitItem>,
    friends: List<FriendItem>,
    isLoading: Boolean,
    isSaving: Boolean,
    onSave: (splitId: String?, friendId: String, amount: String, onDone: () -> Unit) -> Unit,
    onDelete: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val total = abs(statement.amount.toDoubleOrNull() ?: 0.0)
    val allocated = splits.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
    val friendNames = remember(friends) { friends.associate { it.id to it.name } }

    var editingId by remember(statement.id) { mutableStateOf<String?>(null) }
    var friendId by remember(statement.id) { mutableStateOf<String?>(null) }
    var amount by remember(statement.id) { mutableStateOf("") }
    var pendingDeleteId by remember(statement.id) { mutableStateOf<String?>(null) }
    var amountError by remember(statement.id) { mutableStateOf<String?>(null) }

    fun resetForm() {
        editingId = null
        friendId = null
        amount = ""
        amountError = null
    }

    val allocatedElsewhere = allocated - (splits.find { it.id == editingId }?.amount?.toDoubleOrNull() ?: 0.0)
    val remaining = (total - allocatedElsewhere).coerceAtLeast(0.0)
    val usedFriendIds = splits.filter { it.id != editingId }.map { it.friendId }.toSet()
    val availableFriends = friends.filterNot { it.id in usedFriendIds }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column {
                Text(
                    text = "Split · ${statement.category ?: "Expense"}",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = listOfNotNull(statement.accountName, statement.friendName).joinToString(" • ")
                        .ifEmpty { "Expense" },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh, RoundedCornerShape(16.dp))
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                SplitStat("Total", formatAmount(total))
                SplitStat("Split", formatAmount(allocated))
                SplitStat("Your share", formatAmount(total - allocated), emphasis = true)
            }

            if (isLoading && splits.isEmpty()) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            } else if (splits.isEmpty()) {
                Text(
                    text = "Not split yet. Add a friend below.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                Column {
                    splits.forEachIndexed { index, split ->
                        if (index > 0) HorizontalDivider()
                        SplitRow(
                            name = friendNames[split.friendId] ?: "Unknown friend",
                            amount = formatAmount(split.amount),
                            editing = split.id == editingId,
                            confirmingDelete = split.id == pendingDeleteId,
                            enabled = !isSaving,
                            onEdit = {
                                pendingDeleteId = null
                                editingId = split.id
                                friendId = split.friendId
                                amount = plainAmount(split.amount)
                                amountError = null
                            },
                            onDelete = { pendingDeleteId = split.id },
                            onConfirmDelete = {
                                pendingDeleteId = null
                                if (editingId == split.id) resetForm()
                                onDelete(split.id)
                            },
                            onCancelDelete = { pendingDeleteId = null }
                        )
                    }
                }
            }

            HorizontalDivider()

            Text(
                text = if (editingId == null) "Add a split" else "Edit split",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )

            FriendPicker(
                friends = availableFriends,
                selectedId = friendId,
                selectedName = friendId?.let { friendNames[it] },
                onSelect = { friendId = it }
            )

            OutlinedTextField(
                value = amount,
                onValueChange = { amount = it; amountError = null },
                label = { Text("Amount") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                isError = amountError != null,
                supportingText = {
                    Text(amountError ?: "Up to ${formatAmount(remaining)} left to split")
                },
                modifier = Modifier.fillMaxWidth()
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Half" to total / 2, "Third" to total / 3, "All remaining" to remaining).forEach { (label, value) ->
                    AssistChip(
                        onClick = { amount = twoDecimals(value); amountError = null },
                        label = { Text(label) }
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (editingId != null) {
                    OutlinedButton(
                        onClick = { resetForm() },
                        enabled = !isSaving,
                        modifier = Modifier
                            .weight(1f)
                            .height(52.dp)
                    ) {
                        Text("Cancel")
                    }
                }
                Button(
                    onClick = {
                        val selectedFriend = friendId
                        val value = amount.trim().toDoubleOrNull()
                        when {
                            selectedFriend == null -> amountError = "Pick a friend first"
                            value == null || value <= 0 -> amountError = "Enter an amount above zero"
                            value > remaining + 0.005 -> amountError = "Only ${formatAmount(remaining)} is left to split"
                            else -> onSave(editingId, selectedFriend, twoDecimals(value)) { resetForm() }
                        }
                    },
                    enabled = !isSaving,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp)
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                    } else {
                        Text(if (editingId == null) "Add split" else "Save split")
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BulkSplitSheet(
    statements: List<StatementItem>,
    friends: List<FriendItem>,
    isSaving: Boolean,
    serverError: String?,
    onSplit: (friendId: String, percentage: String) -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val friendNames = remember(friends) { friends.associate { it.id to it.name } }
    val nonExpenses = statements.count { it.type == "self_transfer" || it.statementKind != "expense" }
    val total = statements.sumOf { abs(it.amount.toDoubleOrNull() ?: 0.0) }
    val maxPercentage = statements
        .filter { it.type != "self_transfer" && it.statementKind == "expense" }
        .minOfOrNull { statement ->
            val amount = abs(statement.amount.toDoubleOrNull() ?: 0.0)
            if (amount == 0.0) 0.0 else 100.0 - statement.splitAmount / amount * 100.0
        }
        ?.coerceIn(0.0, 100.0) ?: 0.0

    var friendId by remember { mutableStateOf<String?>(null) }
    var percentage by remember { mutableStateOf("50") }
    var error by remember { mutableStateOf<String?>(null) }
    val value = percentage.trim().toDoubleOrNull()

    ModalBottomSheet(onDismissRequest = { if (!isSaving) onDismiss() }, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column {
                Text(
                    text = "Split ${statementCountLabel(statements.size)}",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Each statement gets the same percentage split with one friend.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (nonExpenses > 0) {
                Text(
                    text = "Only expenses can be split. Unselect $nonExpenses " +
                        if (nonExpenses == 1) "statement that isn't an expense." else "statements that aren't expenses.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error
                )
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surfaceContainerHigh, RoundedCornerShape(16.dp))
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    SplitStat("Selected", formatAmount(total))
                    SplitStat(
                        "Friend pays",
                        if (value != null) formatAmount(total * value / 100.0) else "—"
                    )
                    SplitStat("Max", "${twoDecimals(maxPercentage)}%", emphasis = true)
                }

                FriendPicker(
                    friends = friends,
                    selectedId = friendId,
                    selectedName = friendId?.let { friendNames[it] },
                    onSelect = { friendId = it; error = null }
                )

                OutlinedTextField(
                    value = percentage,
                    onValueChange = { percentage = it; error = null },
                    label = { Text("Percentage") },
                    suffix = { Text("%") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    isError = error != null,
                    supportingText = {
                        Text(error ?: "Up to ${twoDecimals(maxPercentage)}% for these statements")
                    },
                    modifier = Modifier.fillMaxWidth()
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("50%" to 50.0, "33.33%" to 100.0 / 3, "25%" to 25.0, "Max" to maxPercentage).forEach { (label, preset) ->
                        AssistChip(
                            onClick = { percentage = twoDecimals(preset); error = null },
                            label = { Text(label) }
                        )
                    }
                }

                if (serverError != null) {
                    Text(
                        text = serverError,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error
                    )
                }

                Button(
                    onClick = {
                        val selectedFriend = friendId
                        when {
                            selectedFriend == null -> error = "Pick a friend first"
                            value == null || value <= 0 -> error = "Enter a percentage above zero"
                            value > maxPercentage + 0.005 -> error = "At most ${twoDecimals(maxPercentage)}% is left on one of these"
                            else -> onSplit(selectedFriend, twoDecimals(value))
                        }
                    },
                    enabled = !isSaving,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                    } else {
                        Text("Split ${statementCountLabel(statements.size)}")
                    }
                }
            }
        }
    }
}

@Composable
private fun SplitStat(label: String, value: String, emphasis: Boolean = false) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = if (emphasis) FontWeight.Bold else FontWeight.Medium,
            color = if (emphasis) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun SplitRow(
    name: String,
    amount: String,
    editing: Boolean,
    confirmingDelete: Boolean,
    enabled: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onConfirmDelete: () -> Unit,
    onCancelDelete: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = name,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (editing) FontWeight.SemiBold else FontWeight.Normal,
            color = if (editing) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        if (confirmingDelete) {
            TextButton(onClick = onCancelDelete) { Text("Keep") }
            TextButton(onClick = onConfirmDelete, enabled = enabled) {
                Text("Delete", color = MaterialTheme.colorScheme.error)
            }
        } else {
            Text(
                text = amount,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium
            )
            IconButton(onClick = onEdit, enabled = enabled) {
                Icon(Icons.Default.Edit, contentDescription = "Edit split")
            }
            IconButton(onClick = onDelete, enabled = enabled) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = "Delete split",
                    tint = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FriendPicker(
    friends: List<FriendItem>,
    selectedId: String?,
    selectedName: String?,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selectedName.orEmpty(),
            onValueChange = {},
            readOnly = true,
            label = { Text("Friend") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            if (friends.isEmpty()) {
                DropdownMenuItem(text = { Text("Everyone already has a split") }, onClick = { expanded = false }, enabled = false)
            }
            friends.forEach { friend ->
                DropdownMenuItem(
                    text = { Text(friend.name) },
                    onClick = {
                        onSelect(friend.id)
                        expanded = false
                    },
                    trailingIcon = if (friend.id == selectedId) {
                        { Text("✓") }
                    } else {
                        null
                    }
                )
            }
        }
    }
}

private fun twoDecimals(value: Double): String =
    BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).toPlainString()

private fun plainAmount(value: String): String =
    value.toBigDecimalOrNull()?.stripTrailingZeros()?.toPlainString() ?: value

private fun statementCountLabel(count: Int): String =
    if (count == 1) "1 statement" else "$count statements"
