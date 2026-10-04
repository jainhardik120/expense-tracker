package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class CityUnionBankParser : BaseIndianBankParser() {

    override fun getBankName() = "City Union Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("CUBANK") ||
                normalizedSender.contains("CUBLTD") ||
                normalizedSender.contains("CUB")
    }

    override fun extractAmount(message: String): BigDecimal? {
        val amountPatterns = listOf(
            Regex("""debited\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""credited\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""credited\s+with\s+INR\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in amountPatterns) {
            pattern.find(message)?.let { match ->
                val amount = match.groupValues[1].replace(",", "")
                return try {
                    BigDecimal(amount)
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
            lowerMessage.contains("debited for") -> TransactionType.EXPENSE
            lowerMessage.contains("debited from") -> TransactionType.EXPENSE

            lowerMessage.contains("is credited") -> TransactionType.INCOME
            lowerMessage.contains("credited for") -> TransactionType.INCOME
            lowerMessage.contains("credited with") -> TransactionType.INCOME
            lowerMessage.contains("credited to") -> TransactionType.INCOME

            lowerMessage.contains("neft trf") -> TransactionType.INCOME

            else -> super.extractTransactionType(message)
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("neft trf")) {
            val neftPattern = Regex(
                """BY\s+NEFT\s+TRF:([^:]+)""",
                RegexOption.IGNORE_CASE
            )
            neftPattern.find(message)?.let { match ->
                val merchant = cleanMerchantName(match.groupValues[1].trim())
                return "NEFT - $merchant"
            }
            return "NEFT Transfer"
        }

        if (message.contains("UPI Ref", ignoreCase = true)) {
            val toAccountPattern = Regex(
                """credited\s+to\s+a/c\s+no\.\s+([A-Z0-9]+)""",
                RegexOption.IGNORE_CASE
            )
            val fromAccountPattern = Regex(
                """debited\s+from\s+a/c\s+no\.\s+([A-Z0-9]+)""",
                RegexOption.IGNORE_CASE
            )

            toAccountPattern.find(message)?.let { match ->
                val accountLast4 = if (match.groupValues[1].length >= 4) {
                    match.groupValues[1].takeLast(4)
                } else {
                    match.groupValues[1]
                }
                return "UPI Transfer to A/C XX$accountLast4"
            }

            fromAccountPattern.find(message)?.let { match ->
                val accountLast4 = if (match.groupValues[1].length >= 4) {
                    match.groupValues[1].takeLast(4)
                } else {
                    match.groupValues[1]
                }
                return "UPI Transfer from A/C XX$accountLast4"
            }

            return "UPI Transfer"
        }

        if (lowerMessage.contains("credited to a/c") || lowerMessage.contains("debited from a/c")) {
            return "Account Transfer"
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPatterns = listOf(
            Regex("""Your\s+a/c\s+no\.\s+[X]*(\d{3,4})""", RegexOption.IGNORE_CASE),
            Regex("""Savings\s+No\s+[X]*(\d{3,4})""", RegexOption.IGNORE_CASE)
        )

        for (pattern in accountPatterns) {
            pattern.find(message)?.let { match ->
                val digits = match.groupValues[1]
                return if (digits.length >= 4) digits.takeLast(4) else digits
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
            """Avl\s+Bal\s+([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        balancePattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractBalance(message)
    }

    override fun extractReference(message: String): String? {
        val upiRefPattern = Regex(
            """\(UPI\s+Ref\s+no\s+(\d+)\)""",
            RegexOption.IGNORE_CASE
        )
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val neftRefPattern = Regex(
            """NEFT[:/]\s*([A-Z0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        neftRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("verification") ||
            lowerMessage.contains("request")
        ) {
            return false
        }

        if (lowerMessage.contains("is debited for") ||
            lowerMessage.contains("is credited for") ||
            lowerMessage.contains("credited with") ||
            lowerMessage.contains("neft trf")
        ) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}