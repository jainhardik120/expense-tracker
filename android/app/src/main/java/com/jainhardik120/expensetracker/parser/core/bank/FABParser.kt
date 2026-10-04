package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.CompiledPatterns
import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

open class FABParser : UAEBankParser() {

    override fun getBankName() = "First Abu Dhabi Bank"

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

        val (fromAccount, toAccount) = if (type == TransactionType.TRANSFER) {
            extractTransferAccounts(smsBody)
        } else {
            Pair(null, null)
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
            isFromCard = containsCardPurchase(smsBody),
            currency = currency,
            fromAccount = fromAccount,
            toAccount = toAccount
        )
    }

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()
        return upperSender == "FAB" ||
                upperSender.contains("FABBANK") ||
                upperSender.contains("ADFAB") ||
                upperSender.matches(Regex("^[A-Z]{2}-FAB-[A-Z]$"))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val patterns = listOf(
            Regex("""funds transfer request of\s+(${CompiledPatterns.Currency.ISO_CODE.pattern})\s+([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""for\s+(${CompiledPatterns.Currency.ISO_CODE.pattern})\s+([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""(${CompiledPatterns.Currency.ISO_CODE.pattern})\s+\*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""(${CompiledPatterns.Currency.ISO_CODE.pattern})\s+([0-9*,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""Amount\s*(${CompiledPatterns.Currency.ISO_CODE.pattern})\s+\*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""Amount\s*(${CompiledPatterns.Currency.ISO_CODE.pattern})\s+([0-9*,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""payment.*?(${CompiledPatterns.Currency.ISO_CODE.pattern})\s+\*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""payment.*?(${CompiledPatterns.Currency.ISO_CODE.pattern})\s+([0-9*,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in patterns) {
            pattern.find(message)?.let { match ->
                val currencyCode = match.groupValues[1].uppercase()
                var amountStr = match.groupValues[2].replace(",", "")

                if (amountStr.contains("*")) {
                    if (amountStr.matches(Regex("""\*\d+(?:\.\d{2})?"""))) {
                        amountStr = amountStr.substring(1)
                    } else if (amountStr.matches(Regex("""\*+\.\d{2}"""))) {
                        amountStr = "0" + amountStr.substring(amountStr.indexOf('.'))
                    } else {
                        val numericMatch = Regex("""(\d+(?:\.\d{2})?)""").find(amountStr)
                        if (numericMatch != null) {
                            amountStr = numericMatch.value
                        } else {
                            return super.extractAmount(message)
                        }
                    }
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
        return super.extractTransactionType(message)
    }

    override fun extractMerchant(message: String, sender: String): String? {
        if (containsCardPurchase(message)) {
            val singleLinePattern = Regex(
                """(?:Credit|Debit)\s+Card\s+Purchase\s+Card\s+No\s+[X\d]+\s+[A-Z]{3}\s+[\d,.]+\s+([^0-9]+?)(?:\s+\d{2}/\d{2}/\d{2})""",
                RegexOption.IGNORE_CASE
            )
            singleLinePattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty()) {
                    val cleanedMerchant = merchant.replace("*", "").trim()
                    return cleanMerchantName(cleanedMerchant)
                }
            }

            val lines = message.split("\n")

            val currencyLineIndex = lines.indexOfFirst {
                it.matches(
                    Regex(
                        ".*${CompiledPatterns.Currency.ISO_CODE.pattern}\\s+[0-9,]+(?:\\.\\d{2})?.*",
                        RegexOption.IGNORE_CASE
                    )
                )
            }
            if (currencyLineIndex != -1 && currencyLineIndex + 1 < lines.size) {
                val merchantLine = lines[currencyLineIndex + 1].trim()
                val cleanedMerchant = merchantLine.replace("*", "").trim()
                if (cleanedMerchant.isNotEmpty() && !cleanedMerchant.contains("/")) {
                    return cleanMerchantName(cleanedMerchant)
                }
            }

            val cardPattern = Regex("""Card\s+[X\*]+(\d{4})""", RegexOption.IGNORE_CASE)
            val cardMatch = cardPattern.find(message)
            if (cardMatch != null) {
                val cardLineIndex = lines.indexOfFirst { it.contains(cardMatch.value) }
                if (cardLineIndex != -1 && cardLineIndex + 2 < lines.size) {
                    val merchantLine = lines[cardLineIndex + 2].trim()
                    if (merchantLine.isNotEmpty() &&
                        !merchantLine.contains("Available Balance") &&
                        !merchantLine.matches(Regex("""\d{2}/\d{2}/\d{2}\s+\d{2}:\d{2}"""))
                    ) {
                        val cleanedMerchant = merchantLine.replace("*", "").trim()
                        return cleanMerchantName(cleanedMerchant)
                    }
                }
            }

            val merchantPattern =
                Regex("""([A-Z]+\.(?:COM|NET|ORG|IN)[^\n]*)""", RegexOption.IGNORE_CASE)
            merchantPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty()) {
                    val cleanedMerchant = merchant.replace("*", "").trim()
                    return cleanMerchantName(cleanedMerchant)
                }
            }
        }

        if (message.contains("payment instructions", ignoreCase = true) ||
            message.contains("funds transfer request", ignoreCase = true)
        ) {
            if (message.contains("funds transfer request", ignoreCase = true)) {
                return formatTransferMerchant(extractTransferAccounts(message))
            }

            val toPattern = Regex("""to\s+([^\s]+)""", RegexOption.IGNORE_CASE)

            toPattern.find(message)?.let { match ->
                val recipient = match.groupValues[1]

                if (recipient.contains("*")) {
                    val visibleDigits = recipient.filter { it.isDigit() }
                    if (visibleDigits.isNotEmpty()) {
                        val displayDigits = if (visibleDigits.length >= 4) {
                            visibleDigits.takeLast(4)
                        } else {
                            visibleDigits
                        }
                        return "Transfer to $displayDigits"
                    }
                }

                val digits = recipient.filter { it.isDigit() || it == 'X' }
                if (digits.isNotEmpty()) {
                    return "Transfer to ${digits.takeLast(4)}"
                }
            }
        }

        if (message.contains("has been credited to your fab account", ignoreCase = true) &&
            !message.contains("unsuccessful transaction", ignoreCase = true)
        ) {
            return "Account Credited"
        }

        val transactionTypeMerchants = mapOf(
            "ATM Cash withdrawal" to "ATM Withdrawal",
            "Inward Remittance" to "Inward Remittance",
            "Outward Remittance" to "Outward Remittance",
            "Cash Deposit" to "Cash Deposit",
            "Cheque Credited" to "Cheque Credited",
            "Cheque Returned" to "Cheque Returned",
            "Cash withdrawal" to "Cash Withdrawal",
            "unsuccessful transaction" to "Refund"
        )

        for ((keyword, merchantName) in transactionTypeMerchants) {
            if (message.contains(keyword, ignoreCase = true)) {
                return merchantName
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        if (message.contains("funds transfer request", ignoreCase = true)) {
            val (fromAccount, _) = extractTransferAccounts(message)
            if (fromAccount != null) {
                return fromAccount
            }
        }

        return extractStandardAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
                """(?:Available|available)\s+[Bb]alance\s+(?:is\s+)?(${CompiledPatterns.Currency.ISO_CODE.pattern})\s*\*{0,}([0-9*,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            )
        balancePattern.find(message)?.let { match ->
            var balanceStr = match.groupValues[2].replace(",", "")

            if (balanceStr.contains("*")) {
                if (balanceStr.matches(Regex("""\*+\d+(?:\.\d{2})?"""))) {
                    val numericPart = balanceStr.replace("*", "")
                    balanceStr = numericPart
                } else if (balanceStr.matches(Regex("""\*+\.\d{2}"""))) {
                    balanceStr = "0" + balanceStr.substring(balanceStr.indexOf('.'))
                } else {
                    return null
                }
            }

            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractBalance(message)
    }

    override fun extractReference(message: String): String? {
        val dateTimePattern = Regex("""(\d{2}/\d{2}/\d{2}\s+\d{2}:\d{2})""")
        dateTimePattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val valueDatePattern =
            Regex("""Value\s+Date\s+(\d{2}/\d{2}/\d{4})""", RegexOption.IGNORE_CASE)
        valueDatePattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    fun shouldParseTransactionMessage(message: String): Boolean {
        return isTransactionMessage(message);
    }

    private fun formatTransferMerchant(accounts: Pair<String?, String?>): String {
        val (fromAccount, toAccount) = accounts

        if (fromAccount != null && toAccount != null) {
            val fromLastThree = fromAccount.takeLast(3)
            val toLastThree = toAccount.takeLast(3)
            return "Transfer: $fromLastThree → $toLastThree"
        } else if (fromAccount != null) {
            val fromLastThree = fromAccount.takeLast(3)
            return "Transfer from $fromLastThree"
        } else if (toAccount != null) {
            val toLastThree = toAccount.takeLast(3)
            return "Transfer to $toLastThree"
        }

        return "Transfer"
    }

    private fun extractStandardAccountLast4(message: String): String? {
        val patterns = listOf(
            Regex("""Card\s+No\s+([X\d]{4})""", RegexOption.IGNORE_CASE),
            Regex("""Account\s+([X\d]{4})\*{0,2}""", RegexOption.IGNORE_CASE),
            Regex("""Account\s+[X\*]+(\d{4})""", RegexOption.IGNORE_CASE)
        )

        for (pattern in patterns) {
            pattern.find(message)?.let { match ->
                val accountStr = match.groupValues[1].replace("X", "")
                if (accountStr.isNotEmpty()) {
                    return accountStr
                }
            }
        }

        return super.extractAccountLast4(message)
    }

    private fun extractTransferAccounts(message: String): Pair<String?, String?> {
        val fromPatterns = listOf(
            Regex("""from\s+account\s+([X\d]{4,})""", RegexOption.IGNORE_CASE),
            Regex("""from\s+account/card\s+([X\d]{4,})""", RegexOption.IGNORE_CASE),
            Regex("""from your account/card\s+([X\d]{4,})""", RegexOption.IGNORE_CASE),
            Regex("""from\s+([X\d]{4,})\s+to\s+account""", RegexOption.IGNORE_CASE)
        )

        val toPatterns = listOf(
            Regex("""to\s+account\s+([X\d]{4,})""", RegexOption.IGNORE_CASE),
            Regex("""to\s+IBAN/Account/Card\s+([X\d]{4,})""", RegexOption.IGNORE_CASE),
            Regex(
                """to\s+IBAN/Account/Card\s+([X\d]{4,})\s+has been processed successfully from""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""to\s+([X\d]{4,})\s+from\s+account""", RegexOption.IGNORE_CASE)
        )

        val extractAccount = { patterns: List<Regex>, default: String? ->
            patterns.firstNotNullOfOrNull { pattern ->
                pattern.find(message)?.groupValues?.get(1)?.let { account ->
                    account.replace("X", "").takeLast(4)
                }
            } ?: default
        }

        val fromAccount = extractAccount(fromPatterns, null)
        val toAccount = extractAccount(toPatterns, null)

        return Pair(fromAccount, toAccount)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val nonTransactionKeywords = listOf(
            "declined due to insufficient balance",
            "transaction has been declined",
            "address update request",
            "statement request",
            "stamped statement",
            "cannot process your",
            "amazing rate",
            "request has been logged",
            "reference number",
            "beneficiary creation/modification request",
            "funds transfer request is under process",
            "has been resolved",
            "funds transfer request has failed",
            "card has been successfully activated",
            "temporarily blocked",
            "never share credit/debit card",
            "debit card.*replacement request",
            "card will be ready for dispatch",
            "replacement request has been registered",
            "otp",
            "activation",
            "thank you for activating",
            "do not disclose your otp",
            "atyourservice@bankfab.com",
            "has been blocked on"
        )

        if (nonTransactionKeywords.any { keyword ->
                lowerMessage.contains(Regex(keyword, RegexOption.IGNORE_CASE))
            }) {
            return false
        }

        if (lowerMessage.contains("bit.ly") ||
            lowerMessage.contains("conditions apply") ||
            lowerMessage.contains("instalments at 0% interest")
        ) {
            if (!lowerMessage.contains("purchase") &&
                !lowerMessage.contains("payment instructions") &&
                !lowerMessage.contains("remittance")
            ) {
                return false
            }
        }

        val fabTransactionKeywords = listOf(
            "credit card purchase",
            "debit card purchase",
            "inward remittance",
            "outward remittance",
            "atm cash withdrawal",
            "payment instructions",
            "has been processed",
            "has been credited to your fab account",
            "cash deposit",
            "cheque credited",
            "cheque returned"
        )

        if (lowerMessage.contains("funds transfer request of")) {
            if (lowerMessage.contains("has been processed")) {
                return true
            }
        }

        if (fabTransactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        if ((lowerMessage.contains("credit") && !lowerMessage.contains("credit card")) ||
            lowerMessage.contains("debit") ||
            lowerMessage.contains("remittance") ||
            lowerMessage.contains("available balance")
        ) {

            val amountPattern = Regex("""${CompiledPatterns.Currency.ISO_CODE.pattern}\s+[0-9,]+(?:\.\d{2})?""", RegexOption.IGNORE_CASE)
            return amountPattern.containsMatchIn(message)
        }

        return super.isTransactionMessage(message)
    }
}