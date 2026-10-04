package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class AUBankParser : BaseIndianBankParser() {

    override fun getBankName() = "AU Small Finance Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("AUBANK")
    }

    override fun extractAmount(message: String): BigDecimal? {
        val creditedPattern = Regex(
            """Credited\s+INR\s+([0-9,]+(?:\.\d{2})?)\s+to""",
            RegexOption.IGNORE_CASE
        )
        creditedPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val debitedPattern = Regex(
            """Debited\s+INR\s+([0-9,]+(?:\.\d{2})?)\s+from""",
            RegexOption.IGNORE_CASE
        )
        debitedPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val spentPattern = Regex(
            """INR\s+([0-9,]+(?:\.\d{2})?)\s+spent""",
            RegexOption.IGNORE_CASE
        )
        spentPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val withdrawnPattern = Regex(
            """withdrawn\s+INR\s+([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        withdrawnPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractAmount(message)
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val upiPattern = Regex(
            """Ref\s+UPI/[^/]+/[^/]+/[^/]+\s+([^(]+)\([^)]+\)""",
            RegexOption.IGNORE_CASE
        )
        upiPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val upiParenPattern = Regex(
            """UPI/[^/]+/[^/]+/[^/]+\s+[^(]*\(([^)]+)\)""",
            RegexOption.IGNORE_CASE
        )
        upiParenPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        if (message.contains("ATM", ignoreCase = true) ||
            message.contains("withdrawn", ignoreCase = true)
        ) {
            return "ATM Withdrawal"
        }

        val toPattern = Regex(
            """(?:to|from)\s+([^.\n]+?)(?:\.\s*|$)""",
            RegexOption.IGNORE_CASE
        )
        toPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant) && !merchant.contains("A/c", ignoreCase = true)) {
                return merchant
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("credited") -> TransactionType.INCOME
            lowerMessage.contains("received") -> TransactionType.INCOME
            lowerMessage.contains("deposited") -> TransactionType.INCOME
            lowerMessage.contains("refund") -> TransactionType.INCOME

            lowerMessage.contains("debited") -> TransactionType.EXPENSE
            lowerMessage.contains("withdrawn") -> TransactionType.EXPENSE
            lowerMessage.contains("spent") -> TransactionType.EXPENSE
            lowerMessage.contains("paid") -> TransactionType.EXPENSE

            lowerMessage.contains("credit card") && lowerMessage.contains("spent") -> TransactionType.CREDIT

            else -> super.extractTransactionType(message)
        }
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPattern = Regex(
            """A/c\s+(\d+)""",
            RegexOption.IGNORE_CASE
        )
        accountPattern.find(message)?.let { match ->
            val accountNumber = match.groupValues[1]
            return if (accountNumber.length >= 4) {
                accountNumber.takeLast(4)
            } else {
                accountNumber
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
            """Bal\s+INR\s+([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        balancePattern.find(message)?.let { match ->
            val balance = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balance)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractBalance(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("one time password") ||
            lowerMessage.contains("verification code")
        ) {
            return false
        }

        val auBankKeywords = listOf(
            "credited inr",
            "debited inr",
            "withdrawn inr",
            "bal inr",
            "ref upi"
        )

        if (auBankKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}
