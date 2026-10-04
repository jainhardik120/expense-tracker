package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class JuspayParser : BaseIndianBankParser() {

    override fun getBankName() = "Amazon Pay"

    override fun getCurrency() = "INR"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("JUSPAY") ||
                normalizedSender.contains("APAY") ||
                normalizedSender == "AMAZON PAY"
    }

    override fun extractAmount(message: String): BigDecimal? {
        val debitPattern =
            Regex("""debited\s+for\s+INR\s+([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
        debitPattern.find(message)?.let { match ->
            return try {
                BigDecimal(match.groupValues[1].replace(",", ""))
            } catch (e: NumberFormatException) {
                null
            }
        }

        val paymentPattern =
            Regex("""Payment\s+of\s+Rs\s+([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
        paymentPattern.find(message)?.let { match ->
            return try {
                BigDecimal(match.groupValues[1].replace(",", ""))
            } catch (e: NumberFormatException) {
                null
            }
        }

        val genericPattern = Regex("""Rs\s+([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
        genericPattern.find(message)?.let { match ->
            return try {
                BigDecimal(match.groupValues[1].replace(",", ""))
            } catch (e: NumberFormatException) {
                null
            }
        }

        val inrPattern = Regex("""INR\s+([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
        inrPattern.find(message)?.let { match ->
            return try {
                BigDecimal(match.groupValues[1].replace(",", ""))
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractAmount(message)
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val lowerMessage = message.lowercase()

        val merchantPattern = Regex(
            """successful\s+at\s+(.+?)(?:\.\s*Updated|\s*\.\s*Updated|\.(?:\s|$))""",
            RegexOption.IGNORE_CASE
        )
        merchantPattern.find(message)?.let { match ->
            return match.groupValues[1].trim()
        }

        return when {
            lowerMessage.contains("amazon") -> "Amazon"
            lowerMessage.contains("flipkart") -> "Flipkart"
            lowerMessage.contains("swiggy") -> "Swiggy"
            lowerMessage.contains("zomato") -> "Zomato"
            lowerMessage.contains("ola") -> "Ola"
            lowerMessage.contains("uber") -> "Uber"
            lowerMessage.contains("zepto") -> "Zepto"
            lowerMessage.contains("blinkit") -> "Blinkit"
            lowerMessage.contains("apay wallet") -> "Amazon Pay Transaction"
            lowerMessage.contains("wallet") -> "Amazon Pay Transaction"
            else -> super.extractMerchant(message, sender) ?: "Amazon Pay"
        }
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("debited") -> TransactionType.EXPENSE
            lowerMessage.contains("payment") -> TransactionType.EXPENSE
            lowerMessage.contains("charged") -> TransactionType.EXPENSE
            lowerMessage.contains("credited") -> TransactionType.CREDIT
            lowerMessage.contains("refunded") -> TransactionType.CREDIT
            lowerMessage.contains("received") -> TransactionType.CREDIT
            else -> null
        }
    }

    override fun extractReference(message: String): String? {
        val refPattern = Regex(
            """Transaction\s+Reference\s+Number\s+is\s+(\d{12})""",
            RegexOption.IGNORE_CASE
        )
        refPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val altRefPattern = Regex(
            """Reference\s+(?:Number|No)[:\s]+(\d{12})""",
            RegexOption.IGNORE_CASE
        )
        altRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val transactionKeywords = listOf(
            "debited for",
            "payment of rs",
            "using apay balance",
            "transaction reference number",
            "updated balance is"
        )

        return transactionKeywords.any { lowerMessage.contains(it) } ||
                super.isTransactionMessage(message)
    }
}
