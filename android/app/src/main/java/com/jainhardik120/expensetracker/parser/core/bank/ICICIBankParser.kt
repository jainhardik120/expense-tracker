package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class ICICIBankParser : BaseIndianBankParser() {

    override fun getBankName() = "ICICI Bank"

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
            if (currency.length == 3 &&
                !currency.matches(Regex("^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$"))
            ) {
                return currency
            }
        }

        return null
    }

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("ICICI") ||
                normalizedSender.contains("ICICIB") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-ICICIB-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-ICICI-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-ICICIB-[TPG]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-ICICIB$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-ICICI$")) ||
                normalizedSender == "ICICIB" ||
                normalizedSender == "ICICIBANK"
    }

    override fun extractAmount(message: String): BigDecimal? {
        val multiCurrencySpentPattern = Regex(
            """[A-Z]{3}\s+([0-9,]+(?:\.\d{2})?)\s+spent""",
            RegexOption.IGNORE_CASE
        )
        multiCurrencySpentPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val inrSpentPattern = Regex(
            """(?:Rs\.?|INR)\s+([0-9,]+(?:\.\d{2})?)\s+spent""",
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

        val debitWithPattern = Regex(
            """debited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        debitWithPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val debitForPattern = Regex(
            """debited\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        debitForPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val creditWithPattern = Regex(
            """credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        creditWithPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val creditColonPattern = Regex(
            """credited:\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        creditColonPattern.find(message)?.let { match ->
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
        REFUND_SOURCE.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val salaryPattern = Regex(
            """Info\s+INF\*[^*]+\*[^*]*SAL[^.]*""",
            RegexOption.IGNORE_CASE
        )
        if (salaryPattern.find(message) != null) {
            return "Salary"
        }

        val cardMerchantPattern = Regex(
            """on\s+\d{1,2}-\w{3}-\d{2}\s+(?:at|on)\s+([^.]+?)(?:\.|\s+Avl|$)""",
            RegexOption.IGNORE_CASE
        )
        cardMerchantPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val achNachPattern = Regex(
            """Info\s+(?:ACH|NACH)\*([^*]+)\*""",
            RegexOption.IGNORE_CASE
        )
        achNachPattern.find(message)?.let { match ->
            val companyName = cleanMerchantName(match.groupValues[1].trim())
            return "$companyName Dividend"
        }

        val towardsPattern = Regex(
            """towards\s+([^.\n]+?)\s+for""",
            RegexOption.IGNORE_CASE
        )
        towardsPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val fromUpiPattern = Regex(
            """from\s+([^.\n]+?)\.\s*UPI""",
            RegexOption.IGNORE_CASE
        )
        fromUpiPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val creditedPattern = Regex(
            """;\s*([^.\n]+?)\s+credited\.\s*UPI""",
            RegexOption.IGNORE_CASE
        )
        creditedPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        if (message.contains("Info BY CASH", ignoreCase = true)) {
            return "Cash Deposit"
        }

        if (message.contains("AutoPay", ignoreCase = true)) {
            val lowerMessage = message.lowercase()
            return when {
                lowerMessage.contains("google play") -> "Google Play Store"
                lowerMessage.contains("netflix") -> "Netflix"
                lowerMessage.contains("spotify") -> "Spotify"
                lowerMessage.contains("amazon prime") -> "Amazon Prime"
                lowerMessage.contains("disney") || lowerMessage.contains("hotstar") -> "Disney+ Hotstar"
                lowerMessage.contains("youtube") -> "YouTube Premium"
                else -> "AutoPay Subscription"
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val cardPattern = Regex(
            """ICICI\s+Bank\s+Card\s+[X\*]*(\d+)""",
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

        val creditCardPattern = Regex(
            """ICICI\s+Bank\s+Credit\s+Card\s+[X\*]*(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        creditCardPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val accountPattern = Regex(
            """ICICI\s+Bank\s+(?:\w+\s+)?Acc(?:t|ount)?\s+([X\*]*\d+)""",
            RegexOption.IGNORE_CASE
        )
        accountPattern.find(message)?.let { match ->
            val accountStr = match.groupValues[1]
            val digitsOnly = accountStr.filter { it.isDigit() }
            return if (digitsOnly.length >= 4) {
                digitsOnly.takeLast(4)
            } else if (digitsOnly.isNotEmpty()) {
                digitsOnly
            } else {
                null
            }
        }

        val bankAcctPattern = Regex(
            """ICICI\s+Bank\s+Acct\s+[X\*]*(\d{3,4})""",
            RegexOption.IGNORE_CASE
        )
        bankAcctPattern.find(message)?.let { match ->
            return match.groupValues[1].takeLast(4)
        }

        val acctXXPattern = Regex(
            """Acct\s+XX(\d{3,4})(?:\s|$|[,;.])""",
            RegexOption.IGNORE_CASE
        )
        acctXXPattern.find(message)?.let { match ->
            return match.groupValues[1].takeLast(4)
        }

        val acctStarPattern = Regex(
            """Acct\s+\*+(\d{3,4})(?:\s|$|[,;.])""",
            RegexOption.IGNORE_CASE
        )
        acctStarPattern.find(message)?.let { match ->
            return match.groupValues[1].takeLast(4)
        }

        return null
    }

    override fun extractBalance(message: String): BigDecimal? {
        val availBalIsPattern = Regex(
            """Available\s+Balance\s+is\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        availBalIsPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val avlBalPattern = Regex(
            """Avl\s+Bal\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        avlBalPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val updatedBalPattern = Regex(
            """Updated\s+Bal[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        updatedBalPattern.find(message)?.let { match ->
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
        val rrnPattern = Regex(
            """RRN\s+([A-Za-z0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        rrnPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val upiPattern = Regex(
            """UPI:([A-Za-z0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        upiPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val txnRefPattern = Regex(
            """transaction\s+reference\s+no\.?([A-Z0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        txnRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("sms block") && lowerMessage.contains("to 9215676766")) {
        }

        if (lowerMessage.contains("cash deposit transaction") &&
            lowerMessage.contains("has been completed")
        ) {
            return false
        }

        if (lowerMessage.contains("is due by")) {
            return false
        }

        if (lowerMessage.contains("will be debited")) {
            return false
        }

        if (lowerMessage.contains("has been received on your icici bank credit card")) {
            return false
        }

        val iciciKeywords = listOf(
            "debited with",
            "debited for",
            "credited with",
            "credited:",
            "autopay",
            "your account has been",
            "inr",
            "spent using"
        )

        if (iciciKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        if ((lowerMessage.contains("icici bank credit card") ||
                    (lowerMessage.contains("icici bank card") && lowerMessage.contains("spent"))) &&
            (lowerMessage.contains("spent") || lowerMessage.contains("debited"))
        ) {
            return TransactionType.CREDIT
        }

        if (lowerMessage.contains("info by cash")) {
            return TransactionType.INCOME
        }

        return super.extractTransactionType(message)
    }

    private companion object {
        val REFUND_SOURCE = Regex(
            """^\s*(.+?)\s+refund\s+of\s+(?:Rs|INR)""",
            RegexOption.IGNORE_CASE
        )
    }
}