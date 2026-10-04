package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class CIBEgyptParser : BankParser() {

    override fun getBankName() = "CIB Egypt"

    override fun getCurrency() = "EGP"

    override fun parse(smsBody: String, sender: String, timestamp: Long): ParsedTransaction? {
        if (!isTransactionMessage(smsBody)) {
            return null
        }

        val amount = extractAmount(smsBody)
        if (amount == null) {
            return null
        }

        val type = extractTransactionType(smsBody)
        if (type == null) {
            return null
        }

        val currency = extractCurrency(smsBody) ?: getCurrency()

        return ParsedTransaction(
            amount = amount,
            type = type,
            merchant = extractMerchant(smsBody, sender),
            reference = extractReference(smsBody),
            accountLast4 = extractAccountLast4(smsBody),
            balance = extractBalance(smsBody),
            creditLimit = extractAvailableLimit(smsBody),
            smsBody = smsBody,
            sender = sender,
            timestamp = timestamp,
            bankName = getBankName(),
            isFromCard = detectIsCard(smsBody),
            currency = currency
        )
    }

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender == "CIB" ||
                normalizedSender.contains("CIB") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-CIB$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-CIB-[A-Z]$"))
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("one time password") ||
            lowerMessage.contains("verification code")
        ) {
            return false
        }

        val cibKeywords = listOf(
            "was charged",
            "was debited",
            "was spent",
            "has been refunded",
            "credited"
        )

        return cibKeywords.any { lowerMessage.contains(it) }
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("has been refunded") -> TransactionType.INCOME
            lowerMessage.contains("refunded") -> TransactionType.INCOME

            lowerMessage.contains("was charged") -> TransactionType.EXPENSE
            lowerMessage.contains("was debited") -> TransactionType.EXPENSE
            lowerMessage.contains("was spent") -> TransactionType.EXPENSE

            lowerMessage.contains("credited") -> TransactionType.INCOME

            else -> super.extractTransactionType(message)
        }
    }

    override fun extractAmount(message: String): BigDecimal? {
        val chargePattern = Regex(
            """(?:for|with)\s+([A-Z]{3})\s+([0-9,]*\.?\d+)""",
            RegexOption.IGNORE_CASE
        )
        chargePattern.find(message)?.let { match ->
            val amountStr = match.groupValues[2].replace(",", "")
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractAmount(message)
    }

    override fun extractCurrency(message: String): String? {
        val currencyPattern = Regex(
            """(?:for|with)\s+([A-Z]{3})\s+[0-9,]*\.?\d+""",
            RegexOption.IGNORE_CASE
        )
        currencyPattern.find(message)?.let { match ->
            return match.groupValues[1].uppercase()
        }

        return super.extractCurrency(message)
    }

    override fun extractAccountLast4(message: String): String? {
        val cardEndingPattern = Regex(
            """(?:credit\s+card|card)\s*(?:ending\s+with)?#(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        cardEndingPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("was charged") || lowerMessage.contains("was debited") ||
            lowerMessage.contains("was spent")
        ) {
            val atMerchantPattern = Regex(
                """at\s+([A-Z0-9\s\/&\-]+?)\s+on\s+\d""",
                RegexOption.IGNORE_CASE
            )
            atMerchantPattern.find(message)?.let { match ->
                val merchant = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(merchant)) {
                    return merchant
                }
            }
        }

        if (lowerMessage.contains("refunded")) {
            val fromMerchantPattern = Regex(
                """from\s+([A-Z0-9\s\/&\-]+?)\s+with\s+[A-Z]{3}""",
                RegexOption.IGNORE_CASE
            )
            fromMerchantPattern.find(message)?.let { match ->
                val merchant = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(merchant)) {
                    return merchant
                }
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAvailableLimit(message: String): BigDecimal? {
        val limitPattern = Regex(
            """(?:Card\s+)?available\s+limit\s+is\s+[A-Z]{3}\s+([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        limitPattern.find(message)?.let { match ->
            val limitStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(limitStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractAvailableLimit(message)
    }

    override fun detectIsCard(message: String): Boolean {
        val lowerMessage = message.lowercase()

        return lowerMessage.contains("credit card") ||
                lowerMessage.contains("debit card") ||
                lowerMessage.contains("card ending") ||
                lowerMessage.contains("card#")
    }
}
