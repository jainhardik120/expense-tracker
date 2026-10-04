package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class LaxmiBankParser : BankParser() {

    override fun getBankName() = "Laxmi Sunrise Bank"

    override fun getCurrency() = "NPR"

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()
        return upperSender == "LAXMI_ALERT" ||
                upperSender.contains("LAXMI") ||
                upperSender.contains("LAXMISUNRISE") ||
                upperSender.matches(Regex("""^[A-Z]{2}-LAXMI-[A-Z]$"""))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val patterns = listOf(
            Regex("""NPR\s+([0-9,]+(?:\.[0-9]{2})?)\s""", RegexOption.IGNORE_CASE),
            Regex("""NPR\s+([0-9,]+(?:\.[0-9]{2})?)(?:\s|$)""", RegexOption.IGNORE_CASE),
            Regex(
                """(?:debited|credited)\s+by\s+NPR\s+([0-9,]+(?:\.[0-9]{2})?)""",
                RegexOption.IGNORE_CASE
            )
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
            lowerMessage.contains("has been debited") -> TransactionType.EXPENSE
            lowerMessage.contains("debited by") -> TransactionType.EXPENSE

            lowerMessage.contains("has been credited") -> TransactionType.INCOME
            lowerMessage.contains("credited by") -> TransactionType.INCOME

            else -> null
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val remarksPattern = Regex("""Remarks:\s*\(?([^)]+)\)?""", RegexOption.IGNORE_CASE)
        remarksPattern.find(message)?.let { match ->
            val remarks = match.groupValues[1].trim()
            if (remarks.isNotEmpty()) {
                val cleanedRemarks = when {
                    remarks.contains("ESEWA LOAD") -> "ESEWA"
                    remarks.contains("STIPEND PMT") -> "Stipend Payment"
                    remarks.contains("/") -> remarks.split("/").first().trim()
                    else -> remarks
                }
                return cleanMerchantName(cleanedRemarks)
            }
        }

        if (message.contains("ESEWA", ignoreCase = true)) {
            return "ESEWA"
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPattern = Regex("""Your\s+#(\d+)\s+has\s+been""", RegexOption.IGNORE_CASE)
        accountPattern.find(message)?.let { match ->
            val accountNumber = match.groupValues[1]
            return if (accountNumber.length > 4) {
                accountNumber.takeLast(4)
            } else {
                accountNumber
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractReference(message: String): String? {
        val datePattern = Regex("""on\s+(\d{2}/\d{2}/\d{2})""", RegexOption.IGNORE_CASE)
        datePattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val remarksRefPattern = Regex("""Remarks:.*?([0-9]{6,})""", RegexOption.IGNORE_CASE)
        remarksRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val laxmiTransactionKeywords = listOf(
            "dear customer",
            "has been debited",
            "has been credited",
            "laxmi sunrise",
            "remarks:",
            "npr"
        )

        if (laxmiTransactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}