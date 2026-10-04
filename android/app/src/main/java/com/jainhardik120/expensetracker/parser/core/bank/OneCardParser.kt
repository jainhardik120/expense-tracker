package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class OneCardParser : BankParser() {

    override fun getBankName() = "OneCard"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("ONECRD") ||
                normalizedSender.contains("ONECARD") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-ONECRD-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-ONECARD-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-ONECRD-[TPG]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-ONECARD-[TPG]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-ONECRD$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-ONECARD$")) ||
                normalizedSender == "ONECRD" ||
                normalizedSender == "ONECARD"
    }

    override fun parse(smsBody: String, sender: String, timestamp: Long): ParsedTransaction? {
        val parsed = super.parse(smsBody, sender, timestamp) ?: return null

        return parsed.copy(
            type = TransactionType.CREDIT
        )
    }

    override fun extractAmount(message: String): BigDecimal? {
        val forAmountPattern = Regex(
            """for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+at""",
            RegexOption.IGNORE_CASE
        )
        forAmountPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val ofAmountPattern = Regex(
            """of\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+on""",
            RegexOption.IGNORE_CASE
        )
        ofAmountPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val spentPattern = Regex(
            """spent\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
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

        return super.extractAmount(message)
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val atMerchantOnCardPattern = Regex(
            """at\s+([^•\n]+?)\s+on\s+card""",
            RegexOption.IGNORE_CASE
        )
        atMerchantOnCardPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val merchantPattern = Regex(
            """on\s+([^•\n]+?)\s+on\s+card""",
            RegexOption.IGNORE_CASE
        )
        merchantPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val atMerchantPattern = Regex(
            """at\s+([^•\n]+?)\s+on""",
            RegexOption.IGNORE_CASE
        )
        atMerchantPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val cardEndingPattern = Regex(
            """card\s+ending\s+[X]*(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        cardEndingPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val onCardPattern = Regex(
            """on\s+card\s+[X]*(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        onCardPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("offer") ||
            lowerMessage.contains("cashback offer") ||
            lowerMessage.contains("get reward") ||
            lowerMessage.contains("statement") ||
            lowerMessage.contains("due date") ||
            lowerMessage.contains("bill generated")
        ) {
            return false
        }

        if (lowerMessage.startsWith("you've") &&
            lowerMessage.contains("on card ending")
        ) {
            return true
        }

        if (lowerMessage.contains("spent") ||
            lowerMessage.contains("made a")
        ) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}