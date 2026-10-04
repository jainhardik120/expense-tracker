package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class MashreqBankParser : UAEBankParser() {

    override fun getBankName() = "Mashreq Bank"

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

        val currency = extractCurrency(smsBody) ?: "AED"

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

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()
        return upperSender == "MASHREQ" ||
                upperSender.contains("MASHREQ") ||
                upperSender == "MSHREQ" ||
                upperSender.matches(Regex("^[A-Z]{2}-MASHREQ-[A-Z]$")) ||
                upperSender.matches(Regex("^[A-Z]{2}-MSHREQ-[A-Z]$"))
    }
    

    override fun extractMerchant(message: String, sender: String): String? {
        if (message.contains("debit card", ignoreCase = true) ||
            message.contains("credit card", ignoreCase = true)
        ) {

            val merchantPattern =
                Regex("""at\s+([^,\n]+?)\s+on\s+\d{1,2}-[A-Z]{3}-\d{4}""", RegexOption.IGNORE_CASE)
            merchantPattern.find(message)?.let { match ->
                return cleanMerchantName(match.groupValues[1].trim())
            }
        }

        if (message.contains("atm", ignoreCase = true) &&
            message.contains("withdrawn", ignoreCase = true)
        ) {
            return "ATM Withdrawal"
        }

        if (message.contains("transfer", ignoreCase = true)) {
            return "Transfer"
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val patterns = listOf(
            Regex("""Card ending\s+([X\d]{4})""", RegexOption.IGNORE_CASE),

            Regex("""card\s+(?:no\.|number)\s+([X\d]{4})""", RegexOption.IGNORE_CASE),

            Regex("""account\s+(?:no\.|number)?\s*([X\d]{4})""", RegexOption.IGNORE_CASE)
        )

        for (pattern in patterns) {
            pattern.find(message)?.let { match ->
                val accountStr = match.groupValues[1].replace("X", "")
                if (accountStr.any { it.isDigit() }) {
                    return accountStr
                }
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePatterns = listOf(
            Regex(
                """Available Balance is\s+([A-Z]{3})\s+([X0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),

            Regex(
                """Avl\.?\s*Bal\.?\s+([A-Z]{3})\s+([X0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),

            Regex("""Balance:?\s+([A-Z]{3})\s+([X0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in balancePatterns) {
            pattern.find(message)?.let { match ->
                var balanceStr = match.groupValues[2].replace(",", "")

                balanceStr = balanceStr.replace("X", "0", ignoreCase = true)

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
        val referencePatterns = listOf(
            Regex(
                """on\s+(\d{1,2}-[A-Z]{3}-\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)""",
                RegexOption.IGNORE_CASE
            ),

            Regex("""(\d{1,2}-[A-Z]{3}-\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in referencePatterns) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1]
            }
        }

        return super.extractReference(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("debit card") &&
                    Regex("""for\s+[A-Z]{3}\s+[0-9,]+""", RegexOption.IGNORE_CASE).containsMatchIn(
                        message
                    ) -> TransactionType.EXPENSE

            lowerMessage.contains("credit card") &&
                    Regex("""for\s+[A-Z]{3}\s+[0-9,]+""", RegexOption.IGNORE_CASE).containsMatchIn(
                        message
                    ) -> TransactionType.CREDIT

            lowerMessage.contains("atm") && lowerMessage.contains("withdrawn") -> TransactionType.EXPENSE

            lowerMessage.contains("atm") && lowerMessage.contains("deposited") -> TransactionType.INCOME

            lowerMessage.contains("transfer") -> TransactionType.TRANSFER

            lowerMessage.contains("credited") -> TransactionType.INCOME

            lowerMessage.contains("debited") -> TransactionType.EXPENSE

            else -> super.extractTransactionType(message)
        }
    }

    override fun detectIsCard(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val mashreqCardPatterns = listOf(
            "neo visa debit card",
            "neo debit card",
            "debit card card ending",
            "credit card card ending",
            "card ending",
            "mashreq card"
        )

        return mashreqCardPatterns.any { lowerMessage.contains(it) } ||
                super.detectIsCard(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val nonTransactionKeywords = listOf(
            "otp",
            "one time password",
            "verification code",
            "do not share",
            "activation",
            "has been blocked",
            "has been activated",
            "card request",
            "card application",
            "limit change",
            "pin change",
            "failed transaction",
            "transaction declined",
            "insufficient balance"
        )

        if (nonTransactionKeywords.any { lowerMessage.contains(it) }) {
            return false
        }

        val mashreqTransactionKeywords = listOf(
            "thank you for using",
            "neo visa debit card",
            "neo debit card",
            "debit card card ending",
            "credit card card ending",
            "available balance is"
        )

        if (mashreqTransactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }

    override fun extractCurrency(message: String): String? {
        val currencyPatterns = listOf(
            Regex("""for\s+([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?""", RegexOption.IGNORE_CASE),

            Regex("""of\s+([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?""", RegexOption.IGNORE_CASE),

            Regex("""\b([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?""", RegexOption.IGNORE_CASE)
        )

        for (pattern in currencyPatterns) {
            pattern.find(message)?.let { match ->
                val currencyCode = match.groupValues[1].uppercase()

                if (currencyCode.matches(Regex("""[A-Z]{3}""")) &&
                    !currencyCode.matches(
                        Regex(
                            """^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$""",
                            RegexOption.IGNORE_CASE
                        )
                    )
                ) {
                    return currencyCode
                }
            }
        }

        return "AED"
    }
}
