package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class YesBankParser : BaseIndianBankParser() {

    override fun getBankName() = "Yes Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.matches(Regex("^[A-Z]{2}-YESBNK-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-YESBNK$")) ||
                normalizedSender == "YESBNK" ||
                normalizedSender == "YESBANK"
    }

    override fun extractAmount(message: String): BigDecimal? {
        val inrSpentPattern = Regex(
            """INR\s+([0-9,]+(?:\.\d{2})?)\s+spent""",
            RegexOption.IGNORE_CASE
        )
        inrSpentPattern.find(message)?.let { match ->
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
            """@UPI_([^0-9]+?)(?:\s+\d{2}-\d{2}-\d{4})""",
            RegexOption.IGNORE_CASE
        )
        upiMerchantPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            val cleanedMerchant = merchant
                .replace(Regex("""\s+"""), " ")
                .trim()

            if (cleanedMerchant.isNotEmpty()) {
                return cleanedMerchant
            }
        }

        val upiMerchantAltPattern = Regex(
            """@UPI_([A-Z\s]+)""",
            RegexOption.IGNORE_CASE
        )
        upiMerchantAltPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            val cleanedMerchant = merchant
                .replace(Regex("""\s+"""), " ")
                .trim()

            if (cleanedMerchant.isNotEmpty() && isValidMerchantName(cleanedMerchant)) {
                return cleanedMerchant
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val cardPattern = Regex(
            """YES\s+BANK\s+Card\s+[X]*(\d+)""",
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
            """Card\s+(?:no\.?\s+)?ending\s+[Xx]*(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        endingPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val creditCardPattern = Regex(
            """YES\s+BANK\s+Credit\s+Card\s+[Xx]*(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        creditCardPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val blkccPattern = Regex(
            """SMS\s+BLKCC\s+(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        blkccPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractAvailableLimit(message: String): BigDecimal? {
        val avlLmtPattern = Regex(
            """Avl\s+Lmt\s+INR\s+([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        avlLmtPattern.find(message)?.let { match ->
            val limitStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(limitStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractAvailableLimit(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        if (isInvestmentTransaction(lowerMessage)) {
            return TransactionType.INVESTMENT
        }

        if (lowerMessage.contains("spent") &&
            lowerMessage.contains("yes bank card") &&
            lowerMessage.contains("avl lmt")
        ) {
            return TransactionType.CREDIT
        }

        return when {
            lowerMessage.contains("debited") -> TransactionType.EXPENSE
            lowerMessage.contains("withdrawn") -> TransactionType.EXPENSE
            lowerMessage.contains("spent") -> TransactionType.EXPENSE
            lowerMessage.contains("charged") -> TransactionType.EXPENSE
            lowerMessage.contains("paid") -> TransactionType.EXPENSE

            lowerMessage.contains("credited") -> TransactionType.INCOME
            lowerMessage.contains("deposited") -> TransactionType.INCOME
            lowerMessage.contains("received") -> TransactionType.INCOME
            lowerMessage.contains("refund") -> TransactionType.INCOME

            else -> null
        }
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (isNotATransactionMessage(message)) {
            return false
        }

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("verification") ||
            lowerMessage.contains("one time password")
        ) {
            return false
        }

        if (lowerMessage.contains("offer") ||
            lowerMessage.contains("cashback offer") ||
            lowerMessage.contains("discount")
        ) {
            return false
        }

        val yesBankKeywords = listOf(
            "spent on yes bank card",
            "debited",
            "credited",
            "withdrawn",
            "deposited",
            "avl lmt"
        )

        if (yesBankKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }

    override fun detectIsCard(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("yes bank card")) {
            return true
        }

        if (lowerMessage.contains("sms blkcc")) {
            return true
        }

        return super.detectIsCard(message)
    }
}