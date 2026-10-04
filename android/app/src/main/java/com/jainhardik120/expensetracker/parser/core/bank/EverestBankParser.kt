package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class EverestBankParser : BankParser() {

    override fun getBankName() = "Everest Bank"

    override fun getCurrency() = "NPR"

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()
        return when {
            sender.matches(Regex("""^\d{7,10}$""")) -> true

            upperSender == "EVEREST" ||
                    upperSender.contains("EVERESTBANK") ||
                    upperSender == "UJJ SH" ||
                    upperSender == "CWRD" ||

                    upperSender.matches(Regex("""^[A-Z]{2}-EVEREST-[A-Z]$""")) -> true

            else -> false
        }
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
            lowerMessage.contains("is debited") -> TransactionType.EXPENSE
            lowerMessage.contains("debited by") -> TransactionType.EXPENSE

            lowerMessage.contains("is credited") -> TransactionType.INCOME
            lowerMessage.contains("credited by") -> TransactionType.INCOME

            else -> null
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {

        val forPattern = Regex("""For:\s*([^.]+?)(?:\.\s|$)""", RegexOption.IGNORE_CASE)
        forPattern.find(message)?.let { match ->
            val forContent = match.groupValues[1].trim()

            return when {
                forContent.startsWith("CWDR/", ignoreCase = true) -> {
                    "ATM Withdrawal"
                }

                forContent.contains("/") && forContent.contains(",") -> {
                    val parts = forContent.split(",")
                    if (parts.size >= 2) {
                        val beforeComma = parts[0].trim()
                        val afterComma = parts[1].trim()

                        if (beforeComma.contains("/")) {
                            val slashParts = beforeComma.split("/")
                            if (slashParts.size >= 2) {
                                val paymentType = slashParts[1].trim()
                                if (paymentType.isNotEmpty() && !paymentType.matches(Regex("""\d+"""))) {
                                    return cleanMerchantName(paymentType)
                                }
                            }
                        }

                        if (afterComma.isNotEmpty() && afterComma != "UJJ SH") {
                            return cleanMerchantName(afterComma)
                        }
                    }

                    val allParts = forContent.replace(",", "/").split("/")
                    for (part in allParts) {
                        val cleanPart = part.trim()
                        if (cleanPart.isNotEmpty() &&
                            !cleanPart.matches(Regex("""\d+""")) &&
                            cleanPart != "UJJ SH"
                        ) {
                            return cleanMerchantName(cleanPart)
                        }
                    }
                    null
                }

                else -> {
                    if (forContent.isNotEmpty()) {
                        cleanMerchantName(forContent)
                    } else {
                        null
                    }
                }
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {

        val accountPattern = Regex("""A/c\s+([^\s]+)""", RegexOption.IGNORE_CASE)
        accountPattern.find(message)?.let { match ->
            val account = match.groupValues[1].trim()
            if (account != "{Account}" && account.length >= 4) {
                return account.takeLast(4)
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractReference(message: String): String? {
        val forPattern = Regex("""For:\s*([^.]+?)(?:\.\s|$)""", RegexOption.IGNORE_CASE)
        forPattern.find(message)?.let { match ->
            val forContent = match.groupValues[1].trim()

            if (forContent.contains("CWDR/")) {
                val parts = forContent.split("/")
                if (parts.size >= 3) {
                    return "${parts[1]}/${parts[2]}"
                }
            }

            val refPattern = Regex("""(\d{6,})""")
            refPattern.find(forContent)?.let { refMatch ->
                return refMatch.groupValues[1]
            }
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val everestTransactionKeywords = listOf(
            "dear customer",
            "your a/c",
            "is debited",
            "is credited",
            "debited by",
            "credited by",
            "for:",
            "never share password",
            "npr"
        )

        if (everestTransactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}