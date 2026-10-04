package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class DiscoverCardParser : BankParser() {

    override fun getBankName() = "Discover Card"

    override fun getCurrency() = "USD"

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()
        return upperSender == "DISCOVER" ||
                upperSender.contains("DISCOVERCARD") ||
                upperSender == "347268" ||
                upperSender.matches(Regex("""^[A-Z]{2}-DISCOVER-[A-Z]$"""))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val patterns = listOf(
            Regex("""transaction of\s+\$([0-9,]+(?:\.[0-9]{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""A transaction of\s+\$([0-9,]+(?:\.[0-9]{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""\$([0-9,]+(?:\.[0-9]{2})?)\s+at""", RegexOption.IGNORE_CASE)
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
            lowerMessage.contains("discover card alert") -> TransactionType.EXPENSE
            lowerMessage.contains("transaction of") -> TransactionType.EXPENSE
            lowerMessage.contains("transaction") -> TransactionType.EXPENSE
            else -> null
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val atPattern =
            Regex("""at\s+([^\s]+(?:\s+[^\s]*)*?)(?:\s+on|\s+Text|$)""", RegexOption.IGNORE_CASE)
        atPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            if (merchant.isNotEmpty() && !merchant.matches(Regex("""\w+\s+\d{1,2},\s+\d{4}"""))) {
                return cleanMerchantName(merchant)
            }
        }

        val paypalPattern = Regex("""at\s+(PAYPAL\s+\*[^\s]+)""", RegexOption.IGNORE_CASE)
        paypalPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            if (merchant.isNotEmpty()) {
                return cleanMerchantName(merchant)
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractReference(message: String): String? {
        val datePattern = Regex("""on\s+(\w+\s+\d{1,2},\s+\d{4})""", RegexOption.IGNORE_CASE)
        datePattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("text stop to end")) {
            if (!lowerMessage.contains("transaction of")) {
                return false
            }
        }

        val discoverTransactionKeywords = listOf(
            "discover card alert:",
            "transaction of",
            "no action needed",
            "see it at https://app.discover.com"
        )

        if (discoverTransactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}