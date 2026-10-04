package com.jainhardik120.expensetracker.parser.core.bank

import java.math.BigDecimal

class JupiterBankParser : BankParser() {

    override fun getBankName() = "Jupiter"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.matches(Regex("^[A-Z]{2}-JTEDGE-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-JTEDGE-T$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-JTEDGE$"))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val debitPattern = Regex(
            """Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+debited""",
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

        val creditPattern = Regex(
            """Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+credited""",
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

        return super.extractAmount(message)
    }

    override fun extractMerchant(message: String, sender: String): String? {

        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("edge csb bank rupay credit card") -> "Credit Card Payment"
            lowerMessage.contains("jupiter csb edge") -> "Credit Card Payment"
            lowerMessage.contains("credit card") -> "Credit Card Payment"
            lowerMessage.contains("upi") -> "UPI Transaction"
            else -> super.extractMerchant(message, sender) ?: "Jupiter Transaction"
        }
    }

    override fun extractAccountLast4(message: String): String? {
        val endingPattern = Regex(
            """ending\s+(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        endingPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val cardEndingPattern = Regex(
            """Card\s+ending\s+(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        cardEndingPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractReference(message: String): String? {
        val upiRefPattern = Regex(
            """UPI\s+Ref\s+no\.?\s*([A-Za-z0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("to dispute") && lowerMessage.contains("call")) {
        }

        if (lowerMessage.contains("jupiter") || lowerMessage.contains("csb")) {
            return super.isTransactionMessage(message)
        }

        return super.isTransactionMessage(message)
    }
}
