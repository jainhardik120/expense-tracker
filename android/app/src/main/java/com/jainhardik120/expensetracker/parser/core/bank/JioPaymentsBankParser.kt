package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class JioPaymentsBankParser : BankParser() {

    override fun getBankName() = "Jio Payments Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("JIOPBS")
    }

    override fun extractAmount(message: String): BigDecimal? {
        val creditPattern = Regex(
            """credited\s+with\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        creditPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val sentPattern = Regex(
            """Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+Sent\s+from""",
            RegexOption.IGNORE_CASE
        )
        sentPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val debitPattern = Regex(
            """debited\s+with\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        debitPattern.find(message)?.let { match ->
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
            """UPI/(?:CR|DR)/[\d]+/([^.\n]+?)(?:\s*\.|$)""",
            RegexOption.IGNORE_CASE
        )
        upiPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        return when {
            message.contains("UPI/CR", ignoreCase = true) -> "UPI Credit"
            message.contains("UPI/DR", ignoreCase = true) -> "UPI Payment"
            message.contains("Sent from", ignoreCase = true) -> "Money Transfer"
            else -> super.extractMerchant(message, sender)
        }
    }

    override fun extractAccountLast4(message: String): String? {
        val jpbPattern = Regex(
            """JPB\s+A/c\s+x(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        jpbPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val fromPattern = Regex(
            """from\s+x(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        fromPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
            """Avl\.?\s*Bal:\s*Rs\.?\s*([\d,]+(?:\.\d{1,2})?)""",
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
            """UPI/(?:CR|DR)/(\d+)""",
            RegexOption.IGNORE_CASE
        )
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("credited") -> TransactionType.INCOME
            lowerMessage.contains("upi/cr") -> TransactionType.INCOME
            lowerMessage.contains("debited") -> TransactionType.EXPENSE
            lowerMessage.contains("upi/dr") -> TransactionType.EXPENSE
            lowerMessage.contains("sent from") -> TransactionType.EXPENSE
            else -> super.extractTransactionType(message)
        }
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("jpb a/c") ||
            lowerMessage.contains("upi/cr") ||
            lowerMessage.contains("upi/dr") ||
            lowerMessage.contains("sent from")
        ) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}