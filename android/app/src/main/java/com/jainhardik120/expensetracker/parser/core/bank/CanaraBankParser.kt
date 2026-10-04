package com.jainhardik120.expensetracker.parser.core.bank

import java.math.BigDecimal

class CanaraBankParser : BaseIndianBankParser() {

    override fun getBankName() = "Canara Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("CANBNK") ||
                normalizedSender.contains("CANARA")
    }

    override fun extractAmount(message: String): BigDecimal? {
        val upiAmountPattern = Regex(
            """Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+paid""",
            RegexOption.IGNORE_CASE
        )
        upiAmountPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val debitPattern = Regex(
            """INR\s+([\d,]+(?:\.\d{2})?)\s+has\s+been\s+DEBITED""",
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
        val upiMerchantPattern = Regex(
            """\sto\s+([^,]+?)(?:,\s*UPI|\.|-Canara)""",
            RegexOption.IGNORE_CASE
        )
        upiMerchantPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        if (message.contains("DEBITED", ignoreCase = true)) {
            return "Canara Bank Debit"
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPattern = Regex(
            """(?:account|A/C)\s+(?:XX|X\*+)?(\d{3,4})""",
            RegexOption.IGNORE_CASE
        )
        accountPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
            """(?:Total\s+)?Avail\.?bal\s+INR\s+([\d,]+(?:\.\d{2})?)""",
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
            """UPI\s+Ref\s+(\d+)""",
            RegexOption.IGNORE_CASE
        )
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("failed due to")) {
            return false
        }

        if (lowerMessage.contains("paid thru") ||
            lowerMessage.contains("has been debited") ||
            lowerMessage.contains("has been credited")
        ) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}