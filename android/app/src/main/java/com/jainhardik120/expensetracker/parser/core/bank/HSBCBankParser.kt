package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class HSBCBankParser : BankParser() {

    override fun getBankName() = "HSBC Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("HSBC") ||
                normalizedSender.contains("HSBCIN") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-HSBCIN-[A-Z]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-HSBC-[A-Z]$"))
    }

    override fun parse(
        smsBody: String,
        sender: String,
        timestamp: Long
    ): ParsedTransaction? {
        if (!canHandle(sender)) return null
        if (!isTransactionMessage(smsBody)) return null

        val amount = extractAmount(smsBody) ?: return null
        val transactionType = extractTransactionType(smsBody) ?: return null
        val merchant = extractMerchant(smsBody, sender) ?: "Unknown"

        return ParsedTransaction(
            amount = amount,
            type = transactionType,
            merchant = merchant,
            accountLast4 = extractAccountLast4(smsBody),
            balance = extractBalance(smsBody),
            reference = extractReference(smsBody),
            smsBody = smsBody,
            sender = sender,
            timestamp = timestamp,
            bankName = getBankName()
        )
    }

    override fun extractAmount(message: String): BigDecimal? {
        val pattern1 = Regex(
            """INR\s+([\d,]+(?:\.\d{2})?)\s+is\s+(?:paid|credited|debited)""",
            RegexOption.IGNORE_CASE
        )

        pattern1.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val debitCardPattern = Regex(
            """for\s+INR\s+([\d,]+(?:\.\d{2})?)\s+on""",
            RegexOption.IGNORE_CASE
        )

        debitCardPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val creditCardPattern = Regex(
            """for\s+INR\s+([\d,]+(?:\.\d{2})?)(?:\s|$|\.)""",
            RegexOption.IGNORE_CASE
        )

        creditCardPattern.find(message)?.let { match ->
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
        val outgoingNeftPattern = Regex(
            """credited\s+to\s+the\s+\w+\s+A/c\s+[X\d]+\s+of\s+(.+?)\s+on\s+""",
            RegexOption.IGNORE_CASE
        )
        outgoingNeftPattern.find(message)?.let { match ->
            val beneficiaryName = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(beneficiaryName)) {
                return beneficiaryName
            }
        }

        val neftCreditPattern = Regex(
            """as\s+(?:NEFT|RTGS|IMPS)\s+from\s+(.+?)\s+\.""",
            RegexOption.IGNORE_CASE
        )
        neftCreditPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val atMerchantPattern = Regex(
            """at\s+([^.]+?)\s*\.""",
            RegexOption.IGNORE_CASE
        )
        atMerchantPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val creditCardPattern = Regex(
            """used\s+at\s+([^\s]+)\s+for\s+INR""",
            RegexOption.IGNORE_CASE
        )
        creditCardPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val paymentPattern = Regex(
            """to\s+([^.]+?)\s+on\s+\d""",
            RegexOption.IGNORE_CASE
        )
        paymentPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val creditPattern = Regex(
            """from\s+([^.]+?)(?:\s+on\s+|\s+with\s+|$)""",
            RegexOption.IGNORE_CASE
        )
        creditPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun cleanMerchantName(merchant: String): String {
        var cleaned = super.cleanMerchantName(merchant)

        cleaned = cleaned.replace(Regex("""\s+for\s+INR\s+[\d,]+(?:\.\d{2})?$""", RegexOption.IGNORE_CASE), "")

        return cleaned.trim()
    }

    override fun extractAccountLast4(message: String): String? {
        val acNoPattern = Regex(
            """A/c\s+\d+-\d+\*+-(\d+)""",
            RegexOption.IGNORE_CASE
        )
        acNoPattern.find(message)?.let { match ->
            val lastPart = match.groupValues[1]
            return lastPart.padStart(4, '0')
        }

        val debitCardPattern = Regex(
            """Debit\s+Card\s+[X*]+(\d+[xX]*)""",
            RegexOption.IGNORE_CASE
        )
        debitCardPattern.find(message)?.let { match ->
            val cardNum = match.groupValues[1]
            return if (cardNum.length >= 4) {
                cardNum.takeLast(4).lowercase()
            } else {
                cardNum.lowercase()
            }
        }

        val creditCardPattern = Regex(
            """credit\s*card\s+[xX*]+(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        creditCardPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val accountPattern = Regex(
            """account\s+[X*]+(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        accountPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractReference(message: String): String? {
        val utrPattern = Regex(
            """with\s+UTR\s+(\w+)""",
            RegexOption.IGNORE_CASE
        )
        utrPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val refPattern = Regex(
            """with\s+ref\s+(\w+)""",
            RegexOption.IGNORE_CASE
        )
        refPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val avlBalPattern = Regex(
            """(?:Your\s+)?Avl\s+Bal\s+is\s+INR\s+([\d,]+(?:\.\d{2})?)""",
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

        val availableBalPattern = Regex(
            """available\s+bal\s+is\s+INR\s+([\d,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        availableBalPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractBalance(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("debit card") && lowerMessage.contains("thank you for using") -> TransactionType.EXPENSE
            lowerMessage.contains("debit card") && lowerMessage.contains("for inr") -> TransactionType.EXPENSE

            lowerMessage.contains("creditcard") || lowerMessage.contains("credit card") -> {
                if (lowerMessage.contains("used at")) TransactionType.CREDIT
                else TransactionType.CREDIT
            }

            isOutgoingNeftTransfer(message) -> TransactionType.TRANSFER

            lowerMessage.contains("is paid from") -> TransactionType.EXPENSE
            lowerMessage.contains("is debited") -> TransactionType.EXPENSE
            lowerMessage.contains("is credited to") -> TransactionType.INCOME
            lowerMessage.contains("is credited with") -> TransactionType.INCOME
            lowerMessage.contains("deposited") -> TransactionType.INCOME
            else -> super.extractTransactionType(message)
        }
    }

    private fun isOutgoingNeftTransfer(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (!lowerMessage.contains("neft") &&
            !lowerMessage.contains("rtgs") &&
            !lowerMessage.contains("imps")) {
            return false
        }

        val creditedToOtherBankPattern = Regex(
            """credited\s+to\s+the\s+(\w+)\s+A/c""",
            RegexOption.IGNORE_CASE
        )
        creditedToOtherBankPattern.find(message)?.let { match ->
            val bankName = match.groupValues[1].uppercase()
            if (bankName != "HSBC") {
                return true
            }
        }

        if (lowerMessage.contains("credited to") &&
            Regex("""A/c\s+[X\d]+\s+of\s+\w+""", RegexOption.IGNORE_CASE).containsMatchIn(message)) {
            return true
        }

        return false
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp is") || lowerMessage.contains("otp valid for")
        ) {
            return false
        }

        if (lowerMessage.contains("is paid from") ||
            lowerMessage.contains("is credited to") ||
            lowerMessage.contains("is debited") ||
            (lowerMessage.contains("creditcard") && lowerMessage.contains("used at")) ||
            (lowerMessage.contains("credit card") && lowerMessage.contains("used at")) ||
            (lowerMessage.contains("thank you for using") && lowerMessage.contains("card")) ||
            (lowerMessage.contains("debit card") && lowerMessage.contains("for inr")) ||
            (lowerMessage.contains("inr") && lowerMessage.contains("account"))
        ) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}
