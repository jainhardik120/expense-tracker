package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal
import java.util.Currency

class CharlesSchwabParser : BankParser() {

    override fun getBankName() = "Charles Schwab"

    override fun getCurrency() = "USD"

    override fun extractCurrency(message: String): String? {
        val symbolToCurrencyMap = mapOf(
            "€" to "EUR", "£" to "GBP", "₹" to "INR", "¥" to "JPY",
            "฿" to "THB", "₩" to "KRW", "$" to "USD", "C$" to "CAD",
            "A$" to "AUD", "S$" to "SGD", "ብር" to "ETB"
        )

        for ((symbol, currencyCode) in symbolToCurrencyMap) {
            if (message.contains(symbol)) {
                return try {
                    Currency.getInstance(currencyCode).currencyCode
                } catch (e: IllegalArgumentException) {
                    null
                }
            }
        }

        val currencyCodePattern = Regex("""A\s+([A-Z]{3})\s*[0-9,]+""")
        currencyCodePattern.find(message)?.let { match ->
            val currencyCode = match.groupValues[1]
            return try {
                Currency.getInstance(currencyCode).currencyCode
            } catch (e: IllegalArgumentException) {
                null
            }
        }

        val allCurrencyCodesPattern = Regex("""\b([A-Z]{3})\b""")
        allCurrencyCodesPattern.findAll(message).forEach { match ->
            val currencyCode = match.groupValues[1]
            try {
                Currency.getInstance(currencyCode)
                return currencyCode
            } catch (e: IllegalArgumentException) {
            }
        }

        return super.extractCurrency(message) ?: "USD"
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

        val availableLimit = if (type == TransactionType.CREDIT) {
            val limit = extractAvailableLimit(smsBody)
            limit
        } else {
            null
        }

        val currency = extractCurrency(smsBody) ?: getCurrency()

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

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()
        return upperSender == "SCHWAB" ||
                upperSender.contains("CHARLES SCHWAB") ||
                upperSender.contains("SCHWAB BANK") ||
                upperSender == "24465" ||
                upperSender.matches(Regex("""^[A-Z]{2}-SCHWAB-[A-Z]$"""))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val patterns = listOf(
            Regex(
                """A\s+\$([0-9,]+(?:\.[0-9]{2})?)\s+debit card transaction""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""A\s+\$([0-9,]+(?:\.[0-9]{2})?)\s+ATM transaction""", RegexOption.IGNORE_CASE),
            Regex(
                """A\s+\$([0-9,]+(?:\.[0-9]{2})?)\s+ACH\s+transaction""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A\s+\$([0-9,]+(?:\.[0-9]{2})?)\s+ACH\s+was debited""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A\s+\$([0-9,]+(?:\.[0-9]{2})?)\s+(?:debit card|ATM)\s+transaction""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A\s+([€£₹¥฿₩ብር])\s*([0-9,]+(?:\.[0-9]{2})?)\s+debit card transaction""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A\s+([€£₹¥฿₩ብር])\s*([0-9,]+(?:\.[0-9]{2})?)\s+ATM transaction""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A\s+([€£₹¥฿₩ብር])\s*([0-9,]+(?:\.[0-9]{2})?)\s+ACH\s+transaction""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A\s+([€£₹¥฿₩ብር])\s*([0-9,]+(?:\.[0-9]{2})?)\s+ACH\s+was debited""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A\s+([€£₹¥฿₩ብር])\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:debit card|ATM)\s+transaction""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A\s+([A-Z]{3})\s*([0-9,]+(?:\.[0-9]{2})?)\s+debit card transaction""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A\s+([A-Z]{3})\s*([0-9,]+(?:\.[0-9]{2})?)\s+ATM transaction""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A\s+([A-Z]{3})\s*([0-9,]+(?:\.[0-9]{2})?)\s+ACH\s+transaction""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A\s+([A-Z]{3})\s*([0-9,]+(?:\.[0-9]{2})?)\s+ACH\s+was debited""",
                RegexOption.IGNORE_CASE
            )
        )

        for (pattern in patterns) {
            pattern.find(message)?.let { match ->
                val amountStr = if (match.groupValues.size > 2) {
                    match.groupValues[2].replace(",", "")
                } else {
                    match.groupValues[1].replace(",", "")
                }
                return try {
                    BigDecimal(amountStr)
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }

        return super.extractAmount(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("debit card transaction") -> TransactionType.EXPENSE
            lowerMessage.contains("atm transaction") -> TransactionType.EXPENSE
            lowerMessage.contains("ach transaction") -> TransactionType.EXPENSE
            lowerMessage.contains("ach was debited") -> TransactionType.EXPENSE
            lowerMessage.contains("was debited") -> TransactionType.EXPENSE
            lowerMessage.contains("transaction was debited") -> TransactionType.EXPENSE
            else -> null
        }
    }

    override fun extractAccountLast4(message: String): String? {
        val patterns = listOf(
            Regex("""account ending (\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""account.*ending (\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""from account ending (\d{4})""", RegexOption.IGNORE_CASE)
        )

        for (pattern in patterns) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1]
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("reply stop to end")) {
            if (!lowerMessage.contains("transaction") && !lowerMessage.contains("debited")) {
                return false
            }
        }

        val schwabTransactionKeywords = listOf(
            "debit card transaction was debited",
            "atm transaction was debited",
            "ach was debited",
            "transaction was debited from account"
        )

        if (schwabTransactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }

    override fun detectIsCard(message: String): Boolean {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("debit card transaction") -> true
            lowerMessage.contains("atm transaction") -> true
            lowerMessage.contains("ach transaction") -> false
            else -> super.detectIsCard(message)
        }
    }
}