package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.CompiledPatterns
import com.jainhardik120.expensetracker.parser.core.Constants
import com.jainhardik120.expensetracker.parser.core.InvestmentKeywords
import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

abstract class BankParser {

    abstract fun getBankName(): String

    abstract fun canHandle(sender: String): Boolean

    open fun getCurrency(): String = "INR"

    open fun parse(smsBody: String, sender: String, timestamp: Long): ParsedTransaction? {
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
            currency = getCurrency()
        )
    }

    protected open fun isTransactionMessage(message: String): Boolean {
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

        if (lowerMessage.contains("have received payment")) {
            return false
        }

        if (lowerMessage.contains("is due") ||
            lowerMessage.contains("min amount due") ||
            lowerMessage.contains("minimum amount due") ||
            lowerMessage.contains("in arrears") ||
            lowerMessage.contains("is overdue") ||
            lowerMessage.contains("ignore if paid") ||
            (lowerMessage.contains("pls pay") && lowerMessage.contains("min of"))
        ) {
            return false
        }

        val transactionKeywords = listOf(
            "debited", "credited", "withdrawn", "deposited",
            "spent", "received", "transferred", "paid"
        )

        return transactionKeywords.any { lowerMessage.contains(it) }
    }

    protected open fun extractCurrency(message: String): String? {
        val currencyPattern = Regex("""([A-Z]{3})\s*[0-9,]+(?:\.\d{2})?""", RegexOption.IGNORE_CASE)
        currencyPattern.find(message)?.let { match ->
            return match.groupValues[1].uppercase()
        }
        return null
    }

    protected open fun extractAmount(message: String): BigDecimal? {
        for (pattern in CompiledPatterns.Amount.ALL_PATTERNS) {
            pattern.find(message)?.let { match ->
                val amountStr = match.groupValues[1].replace(",", "")
                return try {
                    BigDecimal(amountStr)
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }

        return null
    }

    protected open fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        if (isInvestmentTransaction(lowerMessage)) {
            return TransactionType.INVESTMENT
        }

        return when {
            lowerMessage.contains("debited") -> TransactionType.EXPENSE
            lowerMessage.contains("withdrawn") -> TransactionType.EXPENSE
            lowerMessage.contains("spent") -> TransactionType.EXPENSE
            lowerMessage.contains("charged") -> TransactionType.EXPENSE
            lowerMessage.contains("paid") -> TransactionType.EXPENSE
            lowerMessage.contains("purchase") -> TransactionType.EXPENSE
            lowerMessage.contains("deducted") -> TransactionType.EXPENSE

            lowerMessage.contains("credited") -> TransactionType.INCOME
            lowerMessage.contains("deposited") -> TransactionType.INCOME
            lowerMessage.contains("received") -> TransactionType.INCOME
            lowerMessage.contains("refund") -> TransactionType.INCOME
            lowerMessage.contains("cashback") && !lowerMessage.contains("earn cashback") -> TransactionType.INCOME

            else -> null
        }
    }

    protected open fun isInvestmentTransaction(lowerMessage: String): Boolean =
        InvestmentKeywords.matches(lowerMessage)

    protected open fun extractMerchant(message: String, sender: String): String? {
        for (pattern in CompiledPatterns.Merchant.ALL_PATTERNS) {
            pattern.find(message)?.let { match ->
                val merchant = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(merchant)) {
                    return merchant
                }
            }
        }

        return null
    }

    protected open fun extractReference(message: String): String? {
        for (pattern in CompiledPatterns.Reference.ALL_PATTERNS) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1].trim()
            }
        }

        return null
    }

    protected open fun extractAccountLast4(message: String): String? {
        for (pattern in CompiledPatterns.Account.ALL_PATTERNS) {
            pattern.find(message)?.let { match ->
                val accountLast4 = match.groupValues[1]

                if (isValidAccountLast4(accountLast4, match.value, message)) {
                    return accountLast4
                }
            }
        }

        return null
    }

    private fun isValidAccountLast4(last4: String, matchedText: String, fullMessage: String): Boolean {
        val escapedLast4 = Regex.escape(last4)

        val datePatterns = listOf(
            Regex("""\d{1,2}[/-]\d{1,2}[/-]$escapedLast4"""),
            Regex("""$escapedLast4[/-]\d{1,2}[/-]\d{1,2}"""),
            Regex("""\bon\s+\d{1,2}[/-]\d{1,2}[/-]$escapedLast4""", RegexOption.IGNORE_CASE),
            Regex("""\bdated\s+\d{1,2}[/-]\d{1,2}[/-]$escapedLast4""", RegexOption.IGNORE_CASE)
        )

        for (datePattern in datePatterns) {
            if (datePattern.find(fullMessage) != null) {
                return false
            }
        }

        val rrnPatterns = listOf(
            Regex("""RRN\s+(?:No\.?)?(\d{8,16})""", RegexOption.IGNORE_CASE),
            Regex("""Ref\s+(?:No\.?)?(\d{8,16})""", RegexOption.IGNORE_CASE)
        )

        for (rrnPattern in rrnPatterns) {
            rrnPattern.find(fullMessage)?.let { rrnMatch ->
                val rrnNumber = rrnMatch.groupValues[1]
                if (rrnNumber.contains(last4)) {
                    return false
                }
            }
        }

        if (last4.toIntOrNull() in 2000..2099) {
            val yearContextPatterns = listOf(
                Regex("""\bon\s+\d{1,2}[/-]\d{1,2}[/-]$escapedLast4""", RegexOption.IGNORE_CASE),
                Regex("""\bdated\s+.*?$escapedLast4""", RegexOption.IGNORE_CASE),
                Regex("""$escapedLast4(?:\s|$)""")
            )

            for (yearPattern in yearContextPatterns) {
                if (yearPattern.find(fullMessage) != null) {
                    val accountBeforeYear = Regex("""(?:A/c|Account|Acct).{0,25}$escapedLast4""", RegexOption.IGNORE_CASE)
                    if (accountBeforeYear.find(fullMessage) == null) {
                        return false
                    }
                }
            }
        }

        return true
    }

    protected open fun extractBalance(message: String): BigDecimal? {
        for (pattern in CompiledPatterns.Balance.ALL_PATTERNS) {
            pattern.find(message)?.let { match ->
                val balanceStr = match.groupValues[1].replace(",", "")
                return try {
                    BigDecimal(balanceStr)
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }

        return null
    }

    protected open fun extractAvailableLimit(message: String): BigDecimal? {

        val creditLimitPatterns = listOf(
            Regex("""Available\s+limit\s+Rs\.([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex(
                """Available\s+limit:?\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""Avl\s+Lmt:?\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""Avail\s+Limit:?\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex(
                """Available\s+Credit\s+Limit:?\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""(?:^|\s)Limit:?\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        for ((index, pattern) in creditLimitPatterns.withIndex()) {
            pattern.find(message)?.let { match ->
                val limitStr = match.groupValues[1].replace(",", "")
                return try {
                    val limit = BigDecimal(limitStr)
                    limit
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }

        return null
    }

    protected open fun detectIsCard(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val namedCardPatterns = listOf(
            "credit card",
            "debit card",
            "card ending",
            "card no.",
            "card number"
        )
        for (pattern in namedCardPatterns) {
            if (lowerMessage.contains(pattern)) {
                return true
            }
        }

        val accountPatterns = listOf(
            "a/c",
            "account",
            "ac ",
            "acc ",
            "saving account",
            "current account",
            "savings a/c",
            "current a/c"
        )

        for (pattern in accountPatterns) {
            if (lowerMessage.contains(pattern)) {
                return false
            }
        }

        val cardPatterns = listOf(
            "card xx",
            "card *",
            "card x"
        )

        for (pattern in cardPatterns) {
            if (lowerMessage.contains(pattern)) {
                return true
            }
        }

        val maskedCardRegex = Regex("""(?:xx|XX|\*{2,})?\d{4}""")
        if (lowerMessage.contains("ending") && maskedCardRegex.containsMatchIn(message)) {
            return true
        }

        return false
    }

    protected open fun cleanMerchantName(merchant: String): String {
        return merchant
            .replace(CompiledPatterns.Cleaning.TRAILING_PARENTHESES, "")
            .replace(CompiledPatterns.Cleaning.REF_NUMBER_SUFFIX, "")
            .replace(CompiledPatterns.Cleaning.DATE_SUFFIX, "")
            .replace(CompiledPatterns.Cleaning.UPI_SUFFIX, "")
            .replace(CompiledPatterns.Cleaning.TIME_SUFFIX, "")
            .replace(CompiledPatterns.Cleaning.TRAILING_DASH, "")
            .replace(CompiledPatterns.Cleaning.PVT_LTD, "")
            .replace(CompiledPatterns.Cleaning.LTD, "")
            .trim()
    }

    protected open fun isValidMerchantName(name: String): Boolean {
        val commonWords =
            setOf("USING", "VIA", "THROUGH", "BY", "WITH", "FOR", "TO", "FROM", "AT", "THE")

        return name.length >= Constants.Parsing.MIN_MERCHANT_NAME_LENGTH &&
                name.any { it.isLetter() } &&
                name.uppercase() !in commonWords &&
                !name.all { it.isDigit() } &&
                !name.contains("@")
    }
}
