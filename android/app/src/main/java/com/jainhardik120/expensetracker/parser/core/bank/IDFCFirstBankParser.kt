package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class IDFCFirstBankParser : BaseIndianBankParser() {

    override fun getBankName() = "IDFC First Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("IDFCBK") ||
                normalizedSender.contains("IDFCFB") ||
                normalizedSender.contains("IDFC")
    }

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

        val currency = extractCurrencyFromMessage(smsBody) ?: "INR"

        val availableLimit = if (type == TransactionType.CREDIT) {
            extractAvailableLimit(smsBody)
        } else {
            null
        }

        return ParsedTransaction(
            amount = amount,
            type = type,
            merchant = extractMerchant(smsBody, sender),
            reference = extractReference(smsBody),
            accountLast4 = extractAccountLast4(smsBody),
            balance = extractBalance(smsBody),
            creditLimit = availableLimit,
            smsBody = smsBody,
            sender = sender,
            timestamp = timestamp,
            bankName = getBankName(),
            isFromCard = detectIsCard(smsBody),
            currency = currency
        )
    }

    private fun extractCurrencyFromMessage(message: String): String? {
        val currencySpentPattern = Regex(
            """([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?\s+spent""",
            RegexOption.IGNORE_CASE
        )
        currencySpentPattern.find(message)?.let { match ->
            val currency = match.groupValues[1].uppercase()
            if (!currency.matches(Regex("^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$"))) {
                return currency
            }
        }

        return null
    }

    override fun extractAmount(message: String): BigDecimal? {
        val amountPatterns = listOf(
            Regex("""[A-Z]{3}\s+([0-9,]+(?:\.\d{2})?)\s+spent""", RegexOption.IGNORE_CASE),

            Regex("""Debit\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""debited\s+by\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""debited\s+by\s+INR\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),

            Regex("""credited\s+by\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""credited\s+with\s+INR\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""credited\s+by\s+INR\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),

            Regex("""interest\s+of\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
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

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("one time password") ||
            lowerMessage.contains("verification code")
        ) {
            return false
        }

        if (lowerMessage.contains("offer") ||
            lowerMessage.contains("discount") ||
            lowerMessage.contains("cashback offer") ||
            lowerMessage.contains("win ")
        ) {
            return false
        }

        if (lowerMessage.contains("has requested") ||
            lowerMessage.contains("payment request") ||
            lowerMessage.contains("collect request") ||
            lowerMessage.contains("requesting payment") ||
            lowerMessage.contains("requests rs") ||
            lowerMessage.contains("ignore if already paid")
        ) {
            return false
        }

        val transactionKeywords = listOf(
            "debit", "debited", "credited", "withdrawn", "deposited",
            "spent", "received", "transferred", "paid", "interest"
        )

        return transactionKeywords.any { lowerMessage.contains(it) }
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()
        return when {
            lowerMessage.contains("debit") -> TransactionType.EXPENSE
            lowerMessage.contains("debited") -> TransactionType.EXPENSE
            lowerMessage.contains("spent") -> TransactionType.EXPENSE
            lowerMessage.contains("credited") -> TransactionType.INCOME
            lowerMessage.contains("withdrawn") || lowerMessage.contains("withdrawal") -> TransactionType.EXPENSE
            lowerMessage.contains("deposited") || lowerMessage.contains("deposit") -> TransactionType.INCOME
            lowerMessage.contains("cash deposit") -> TransactionType.INCOME
            lowerMessage.contains("interest") && lowerMessage.contains("earned") -> TransactionType.INCOME
            lowerMessage.contains("monthly interest") -> TransactionType.INCOME
            else -> super.extractTransactionType(message)
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("monthly interest")) {
            return "Interest Credit"
        }

        if (lowerMessage.contains("cash deposit")) {
            val atmPattern = Regex("""ATM\s+(?:ID\s+)?([A-Z0-9]+)""", RegexOption.IGNORE_CASE)
            atmPattern.find(message)?.let { match ->
                return "Cash Deposit - ATM ${match.groupValues[1]}"
            }
            return "Cash Deposit"
        }

        val merchantCreditedPattern = Regex(
            """;\s*([A-Z][A-Z0-9\s]+?)\s+credited""",
            RegexOption.IGNORE_CASE
        )
        merchantCreditedPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1])
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        if (message.contains("UPI", ignoreCase = true)) {
            val upiPattern = Regex(
                """(?:to|from|at)\s+([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)""",
                RegexOption.IGNORE_CASE
            )
            upiPattern.find(message)?.let { match ->
                return "UPI - ${match.groupValues[1]}"
            }
            return "UPI Transaction"
        }

        if (message.contains("IMPS", ignoreCase = true)) {
            val mobilePattern = Regex("""mobile\s+[X]*(\d{3,4})""", RegexOption.IGNORE_CASE)
            mobilePattern.find(message)?.let { match ->
                return "IMPS Transfer - Mobile XXX${match.groupValues[1]}"
            }
            return "IMPS Transfer"
        }

        when {
            message.contains("NEFT", ignoreCase = true) -> return "NEFT Transfer"
            message.contains("RTGS", ignoreCase = true) -> return "RTGS Transfer"
        }

        if (message.contains("ATM", ignoreCase = true)) {
            val atmIdPattern = Regex("""ATM\s+([A-Z]{2}\d+)""", RegexOption.IGNORE_CASE)
            atmIdPattern.find(message)?.let { match ->
                return "ATM - ${match.groupValues[1]}"
            }
            return "ATM Transaction"
        }

        val toPattern = Regex(
            """(?:to|at|for)\s+([A-Z][A-Z0-9\s&.-]+?)(?:\s+on|\s+New|\.|\,|$)""",
            RegexOption.IGNORE_CASE
        )
        toPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1])
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val cardEndingPattern = Regex(
            """Credit\s+Card\s+ending\s+[X]*(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        cardEndingPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val acPattern = Regex(
            """A/C\s+[X]*(\d{3,4})""",
            RegexOption.IGNORE_CASE
        )
        acPattern.find(message)?.let { match ->
            val digits = match.groupValues[1]
            return if (digits.length >= 4) digits.takeLast(4) else digits
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePatterns = listOf(
            Regex(
                """New\s+Bal\s*:\s*(?:INR|Rs\.?)\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""New\s+balance\s+is\s+INR\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex(
                """Updated\s+balance\s+is\s+INR\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """Available\s+balance\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            )
        )

        for (pattern in balancePatterns) {
            pattern.find(message)?.let { match ->
                val balanceStr = match.groupValues[1].replace(",", "")
                return try {
                    BigDecimal(balanceStr)
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }

        return super.extractBalance(message)
    }

    override fun extractReference(message: String): String? {
        val rrnPattern = Regex(
            """RRN\s+(\d+)""",
            RegexOption.IGNORE_CASE
        )
        rrnPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val impsRefPattern = Regex(
            """IMPS\s+Ref\s+no\s+(\d+)""",
            RegexOption.IGNORE_CASE
        )
        impsRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val upiRefPattern = Regex(
            """UPI[:/]\s*([0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val txnIdPattern = Regex(
            """(?:txn|transaction)\s*(?:id|ref|no)[:\s]*([A-Z0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        txnIdPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }
}
