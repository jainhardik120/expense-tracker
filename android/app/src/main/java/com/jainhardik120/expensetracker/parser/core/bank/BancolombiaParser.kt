package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class BancolombiaParser : BankParser() {

    override fun getBankName() = "Bancolombia"

    override fun canHandle(sender: String): Boolean {
        return sender == "87400" || sender == "85540"
    }

    override fun getCurrency() = "COP"

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()
        val spanishKeywords = listOf(
            "transferiste", "compraste", "pagaste", "recibiste"
        )
        return spanishKeywords.any { lowerMessage.contains(it) }
    }

    override fun extractAmount(message: String): BigDecimal? {
        val pattern = Regex(
            """(Transferiste|Compraste|Pagaste|Recibiste)\s+\$?([0-9.,]+)""",
            RegexOption.IGNORE_CASE
        )
        pattern.find(message)?.let { match ->
            val amount = match.groupValues[2]
                .replace(".", "")
                .replace(",", ".")
                .replace("$", "")
                .trim()
            return try {
                BigDecimal(amount)
            } catch (e: Exception) {
                null
            }
        }

        return null
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lower = message.lowercase()
        return when {
            lower.contains("transferiste") -> TransactionType.EXPENSE
            lower.contains("compraste") -> TransactionType.EXPENSE
            lower.contains("pagaste") -> TransactionType.EXPENSE
            lower.contains("recibiste") -> TransactionType.INCOME
            else -> null
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val lower = message.lowercase()
        return when {
            lower.contains("transferiste") -> "Transferencia"
            lower.contains("compraste") -> "Compra"
            lower.contains("pagaste") -> "Pago"
            lower.contains("recibiste") -> "Dinero recibido"
            else -> "Bancolombia"
        }
    }
}