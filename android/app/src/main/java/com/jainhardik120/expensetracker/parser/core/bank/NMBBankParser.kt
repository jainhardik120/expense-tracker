package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class NMBBankParser : BankParser() {

    override fun getBankName() = "NMB Bank"

    override fun getCurrency() = "NPR"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("NMB") ||
                normalizedSender == "NMB_ALERT" ||
                normalizedSender == "NMBBANK" ||
                normalizedSender.contains("NABIL")
    }

    override fun extractAmount(message: String): BigDecimal? {
        val nprPattern = Regex(
            """NPR\s+([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        nprPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val ofPattern = Regex(
            """of\s+([0-9,]+(?:\.\d{2})?)\s+is successful""",
            RegexOption.IGNORE_CASE
        )
        ofPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return null
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("fund transfer") ||
            lowerMessage.contains("transfer") && lowerMessage.contains("to a/c")
        ) {
            return TransactionType.EXPENSE
        }

        if (lowerMessage.contains("withdrawn")) {
            return TransactionType.EXPENSE
        }

        if (lowerMessage.contains("wallet load") || lowerMessage.contains("esewa wallet")) {
            return TransactionType.EXPENSE
        }

        if (lowerMessage.contains("deposited") || lowerMessage.contains("credited")) {
            return TransactionType.INCOME
        }

        return null
    }

    override fun extractMerchant(message: String, sender: String): String? {
        if (message.contains("Fund transfer", ignoreCase = true) ||
            message.contains("transfer", ignoreCase = true)
        ) {
            return "Fund Transfer"
        }

        if (message.contains("withdrawn", ignoreCase = true)) {
            val atmPattern = Regex("""at\s+([^.\n]+?)(?:\s+on|\.)""", RegexOption.IGNORE_CASE)
            atmPattern.find(message)?.let { match ->
                val location = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(location)) {
                    return "ATM - $location"
                }
            }
            return "ATM Withdrawal"
        }

        val esewaPattern = Regex(
            """Esewa Wallet Load for\s+(\d+)""",
            RegexOption.IGNORE_CASE
        )
        esewaPattern.find(message)?.let { match ->
            return "Esewa Wallet Load"
        }

        if (message.contains("Wallet Load", ignoreCase = true)) {
            return "Wallet Load"
        }

        return null
    }

    override fun extractAccountLast4(message: String): String? {
        val accountLongPattern = Regex(
            """A/C\s+(\d{8,})""",
            RegexOption.IGNORE_CASE
        )
        accountLongPattern.find(message)?.let { match ->
            val accountStr = match.groupValues[1]
            return if (accountStr.length >= 4) {
                accountStr.takeLast(4)
            } else {
                accountStr
            }
        }

        val accountHashPattern = Regex(
            """A/C\s+(\d+)#(\d+)""",
            RegexOption.IGNORE_CASE
        )
        accountHashPattern.find(message)?.let { match ->
            val part1 = match.groupValues[1]
            val part2 = match.groupValues[2]
            val combined = part1 + part2
            return if (combined.length >= 4) {
                combined.takeLast(4)
            } else {
                combined.padStart(4, '0')
            }
        }

        val toAccountPattern = Regex(
            """to A/C\s+(\d+)""",
            RegexOption.IGNORE_CASE
        )
        toAccountPattern.find(message)?.let { match ->
            val accountStr = match.groupValues[1]
            return if (accountStr.length >= 4) {
                accountStr.takeLast(4)
            } else {
                accountStr
            }
        }

        return null
    }

    override fun extractReference(message: String): String? {
        val fbsPattern = Regex(
            """\(FBS:D:FPQR:(\d+)\)"""
        )
        fbsPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val refPattern = Regex(
            """Ref(?:erence)?[:\s]+([A-Z0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        refPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return null
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("password") ||
            lowerMessage.contains("click here to learn more") && !lowerMessage.contains("withdrawn")
        ) {
            if (!lowerMessage.contains("withdrawn")) {
                return false
            }
        }

        val transactionKeywords = listOf(
            "fund transfer",
            "withdrawn",
            "deposited",
            "wallet load",
            "successful",
            "credited"
        )

        return transactionKeywords.any { lowerMessage.contains(it) }
    }
}
