package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class KeralaGraminBankParser : BaseIndianBankParser() {

    override fun getBankName() = "Kerala Gramin Bank"

    override fun getCurrency() = "INR"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("KGBANK") ||
                normalizedSender.contains("KERALA GRAMIN") ||
                normalizedSender.contains("KERALAGR")
    }

    override fun extractAmount(message: String): BigDecimal? {
        val debitCreditPattern = Regex(
            """(?:debited for|credited with)\s+(?:Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{2})?)""",
            RegexOption.IGNORE_CASE
        )
        debitCreditPattern.find(message)?.let { match ->
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

        if (lowerMessage.contains("debited for") ||
            lowerMessage.contains("is debited")
        ) {
            return TransactionType.EXPENSE
        }

        if (lowerMessage.contains("credited with") ||
            lowerMessage.contains("is credited")
        ) {
            return TransactionType.INCOME
        }

        return null
    }

    override fun extractMerchant(message: String, sender: String): String? {
        if (message.contains("debited", ignoreCase = true) &&
            message.contains("credited to", ignoreCase = true)
        ) {
            return "UPI Transfer"
        }

        val upiFromPattern = Regex(
            """from\s+([^.\s]+@[a-z]+)""",
            RegexOption.IGNORE_CASE
        )
        upiFromPattern.find(message)?.let { match ->
            val upiId = match.groupValues[1].trim()
            val namePart = upiId.substringBefore("@")
            if (namePart.matches(Regex("""\d+"""))) {
                return "UPI Payment"
            }
            if (namePart.isNotEmpty()) {
                return cleanMerchantName(namePart)
            }
            return "UPI Payment"
        }

        return null
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPattern = Regex(
            """(?:a/c no\.|Account)\s+(?:XXXX|XX)(\d{3,5})""",
            RegexOption.IGNORE_CASE
        )
        accountPattern.find(message)?.let { match ->
            val digits = match.groupValues[1]
            return if (digits.length >= 4) {
                digits.takeLast(4)
            } else {
                digits.padStart(4, '0')
            }
        }

        return null
    }

    override fun extractReference(message: String): String? {
        val upiRefPattern = Regex(
            """UPI Ref\.?\s*no\.?\s*(\d+)""",
            RegexOption.IGNORE_CASE
        )
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return null
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("password")
        ) {
            return false
        }

        val transactionKeywords = listOf(
            "debited for",
            "is debited",
            "credited with",
            "is credited"
        )

        return transactionKeywords.any { lowerMessage.contains(it) }
    }
}
