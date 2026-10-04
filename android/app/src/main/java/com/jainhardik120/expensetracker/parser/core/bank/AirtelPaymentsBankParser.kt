package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class AirtelPaymentsBankParser : BankParser() {

    override fun getBankName() = "Airtel Payments Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("AIRBNK")
    }

    override fun extractAmount(message: String): BigDecimal? {
        val amountPatterns = listOf(
            Regex("""credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+debited\s+from""", RegexOption.IGNORE_CASE),
            Regex("""debited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
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
            lowerMessage.contains("credited with") -> TransactionType.INCOME
            lowerMessage.contains("is credited") -> TransactionType.INCOME
            lowerMessage.contains("credit") -> TransactionType.INCOME

            lowerMessage.contains("debited from") -> TransactionType.EXPENSE
            lowerMessage.contains("debited with") -> TransactionType.EXPENSE
            lowerMessage.contains("debit") -> TransactionType.EXPENSE

            else -> super.extractTransactionType(message)
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {

        val lowerMessage = message.lowercase()
        return when {
            lowerMessage.contains("airtel payments bank") -> "Airtel Payments Bank Transaction"
            else -> super.extractMerchant(message, sender) ?: "Airtel Payments Bank"
        }
    }

    override fun extractReference(message: String): String? {
        val txnIdPattern = Regex(
            """Txn\s+ID[:\s]+([A-Z0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        txnIdPattern.find(message)?.let { match ->
            val txnId = match.groupValues[1]
            if (!txnId.contains("x", ignoreCase = true)) {
                return txnId
            }
        }

        val altTxnPattern = Regex(
            """Transaction\s+ID[:\s]+([A-Z0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        altTxnPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
            """Bal[:\s]+([0-9,]+(?:\.\d{2})?)""",
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

        val altBalancePattern = Regex(
            """Balance[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        altBalancePattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractBalance(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("verification") ||
            lowerMessage.contains("request") ||
            lowerMessage.contains("failed")
        ) {
            return false
        }

        if (lowerMessage.contains("credited with") ||
            lowerMessage.contains("debited from") ||
            lowerMessage.contains("airtel payments bank") &&
            (lowerMessage.contains("credited") || lowerMessage.contains("debited"))
        ) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}