package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class OldHickoryParser : BankParser() {

    override fun getBankName() = "Old Hickory Credit Union"

    override fun getCurrency() = "USD"

    override fun canHandle(sender: String): Boolean {
        val cleanSender = sender.replace("[^\\d]".toRegex(), "")

        return when {
            cleanSender == "8775907589" -> true

            sender.uppercase().let { upper ->
                upper == "OLDHICKORY" ||
                        upper == "OHCU" ||
                        upper.contains("HICKORY") ||
                        upper.contains("OLD HICKORY")
            } -> true

            sender.uppercase().matches(Regex("""^[A-Z]{2}-HICKORY-[A-Z]$""")) -> true

            else -> false
        }
    }

    override fun extractAmount(message: String): BigDecimal? {
        val patterns = listOf(
            Regex("""\$([0-9,]+(?:\.[0-9]{2})?)"""),
            Regex("""transaction for\s+\$([0-9,]+(?:\.[0-9]{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""posted.*?\$([0-9,]+(?:\.[0-9]{2})?)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in patterns) {
            pattern.find(message)?.let { match ->
                val amountStr = match.groupValues[1].replace(",", "")
                return try {
                    BigDecimal(amountStr)
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }

        return super.extractAmount(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("transaction") && lowerMessage.contains("posted") -> TransactionType.EXPENSE
            lowerMessage.contains("has posted") -> TransactionType.EXPENSE
            lowerMessage.contains("transaction for") -> TransactionType.EXPENSE
            else -> null
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {

        val accountPattern = Regex("""posted to\s+([^(]+)""", RegexOption.IGNORE_CASE)
        accountPattern.find(message)?.let { match ->
            val accountName = match.groupValues[1].trim()
            if (accountName.isNotEmpty()) {
                return "Account: ${cleanMerchantName(accountName)}"
            }
        }

        return "Transaction Alert"
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPattern = Regex("""\(part of\s+([^)]+)\)""", RegexOption.IGNORE_CASE)
        accountPattern.find(message)?.let { match ->
            val accountInfo = match.groupValues[1].trim()
            val digitPattern = Regex("""(\d{4,})""")
            digitPattern.find(accountInfo)?.let { digitMatch ->
                val digits = digitMatch.groupValues[1]
                return if (digits.length >= 4) digits.takeLast(4) else digits
            }
            return accountInfo
        }

        return super.extractAccountLast4(message)
    }

    override fun extractReference(message: String): String? {
        val thresholdPattern = Regex(
            """above the\s+\$([0-9,]+(?:\.[0-9]{2})?)\s+value you set""",
            RegexOption.IGNORE_CASE
        )
        thresholdPattern.find(message)?.let { match ->
            return "Alert threshold: $${match.groupValues[1]}"
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val hickoryTransactionKeywords = listOf(
            "transaction",
            "has posted",
            "posted to",
            "above the",
            "value you set",
            "account name"
        )

        if (hickoryTransactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}