package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class AMEXBankParser : BankParser() {

    override fun getBankName() = "American Express"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("AMEX") ||
                normalizedSender.contains("AMEXIN") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-AMEXIN-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-AMEX-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-AMEXIN-[TPG]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-AMEX-[TPG]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-AMEXIN$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-AMEX$")) ||
                normalizedSender == "AMEXIN" ||
                normalizedSender == "AMEX"
    }

    override fun parse(smsBody: String, sender: String, timestamp: Long): ParsedTransaction? {
        val parsed = super.parse(smsBody, sender, timestamp) ?: return null

        return parsed.copy(
            type = TransactionType.CREDIT
        )
    }

    override fun extractAmount(message: String): BigDecimal? {
        val spentPattern = Regex(
            """spent\s+INR\s+([0-9,]+(?:\.\d{2})?)\s+on""",
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

        val altSpentPattern = Regex(
            """INR\s+([0-9,]+(?:\.\d{2})?)\s+spent""",
            RegexOption.IGNORE_CASE
        )
        altSpentPattern.find(message)?.let { match ->
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
        val merchantPattern = Regex(
            """at\s+([^•\n]+?)\s+on\s+\d{1,2}\s+\w+""",
            RegexOption.IGNORE_CASE
        )
        merchantPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val cardPattern = Regex(
            """AMEX\s+card\s+\*+\s*(\d+)""",
            RegexOption.IGNORE_CASE
        )
        cardPattern.find(message)?.let { match ->
            val cardNumber = match.groupValues[1]
            return if (cardNumber.length >= 4) {
                cardNumber.takeLast(4)
            } else {
                cardNumber
            }
        }

        val endingPattern = Regex(
            """card\s+ending\s+(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        endingPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("offer") ||
            lowerMessage.contains("reward") ||
            lowerMessage.contains("membership") ||
            lowerMessage.contains("statement") ||
            lowerMessage.contains("due date")
        ) {
            return false
        }

        return super.isTransactionMessage(message)
    }
}