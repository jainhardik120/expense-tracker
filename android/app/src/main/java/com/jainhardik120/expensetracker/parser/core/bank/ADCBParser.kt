package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class ADCBParser : FABParser() {

    override fun getBankName() = "Abu Dhabi Commercial Bank"

    override fun getCurrency() = "AED"

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()
        return upperSender == "ADCBALERT" ||
                upperSender.contains("ADCB") ||
                upperSender.contains("ADCBANK") ||
                upperSender.matches(Regex("^[A-Z]{2}-ADCB-[A-Z]$"))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val patterns = listOf(
            Regex("""was used for\s+([A-Z]{3})\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),

            Regex("""used for\s+([A-Z]{3})\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),

            Regex(
                """\b([A-Z]{3})\s*([0-9,]+(?:\.\d{2})?)\s+withdrawn from""",
                RegexOption.IGNORE_CASE
            ),

            Regex(
                """\b([A-Z]{3})\s*([0-9,]+(?:\.\d{2})?)\s+has been deposited via ATM""",
                RegexOption.IGNORE_CASE
            ),

            Regex(
                """\b([A-Z]{3})\s*([0-9,]+(?:\.\d{2})?)\s+transferred via""",
                RegexOption.IGNORE_CASE
            ),

            Regex(
                """Cr\. transaction of\s+([A-Z]{3})\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),

            Regex(
                """Dr\.?\s*transaction of\s+([A-Z]{3})\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),

            Regex(
                """Transaction of\s+([A-Z]{3})\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),

            Regex("""Amount Paid:\s*([A-Z]{3})\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in patterns) {
            val match = pattern.find(message)
            if (match != null) {
                val currencyCode = match.groupValues[1].trim()
                val amountStr = match.groupValues[2].trim()

                if (currencyCode.length == 3 &&
                    currencyCode.matches(Regex("""[A-Z]{3}""")) &&
                    !currencyCode.matches(
                        Regex(
                            """^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$""",
                            RegexOption.IGNORE_CASE
                        )
                    )
                ) {
                    try {
                        val amount = BigDecimal(amountStr.replace(",", ""))
                        if (amount > BigDecimal("0.01")) {
                            return if (amount.scale() < 2) {
                                amount.setScale(2)
                            } else {
                                amount
                            }
                        }
                    } catch (e: NumberFormatException) {
                    }
                }
            }
        }

        if (containsCardPurchase(message)) {
            val afterUsage = message.substringAfter("was used for")
            val currencyAmountPattern = Regex("""([A-Z]{3})\s*([0-9,]+(?:\.\d{2})?)""")
            currencyAmountPattern.find(afterUsage)?.let { match ->
                val currencyCode = match.groupValues[1].trim()
                val amountStr = match.groupValues[2].trim()

                if (currencyCode.length == 3 &&
                    currencyCode.matches(Regex("""[A-Z]{3}""")) &&
                    !currencyCode.matches(
                        Regex(
                            """^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$""",
                            RegexOption.IGNORE_CASE
                        )
                    )
                ) {
                    try {
                        val amount = BigDecimal(amountStr.replace(",", ""))
                        if (amount > BigDecimal("0.01")) {
                            return if (amount.scale() < 2) {
                                amount.setScale(2)
                            } else {
                                amount
                            }
                        }
                    } catch (e: NumberFormatException) {
                    }
                }
            }
        }

        return null
    }

    override fun containsCardPurchase(message: String): Boolean {
        return message.contains("was used for", ignoreCase = true) ||
                message.contains("used for", ignoreCase = true)
    }

    override fun extractMerchant(message: String, sender: String): String? {
        if (containsCardPurchase(message)) {
            val merchantPattern = Regex("""at\s+([^,\n]+),\s*[A-Z]{2}""", RegexOption.IGNORE_CASE)
            merchantPattern.find(message)?.let { match ->
                return cleanMerchantName(match.groupValues[1].trim())
            }
        }

        if (message.contains("TouchPoints Redemption", ignoreCase = true)) {
            return "TouchPoints Redemption"
        }

        if (message.contains("withdrawn from", ignoreCase = true)) {
            val afterAt = message.substringAfter("at ")
            val beforeBalance =
                afterAt.substringBefore(" Avl.Bal").substringBefore("Available balance")

            val atmInfo = beforeBalance.trim().replace(Regex("""\s+"""), " ")

            if (atmInfo.isNotEmpty() && (atmInfo.startsWith("ATM-") || atmInfo.startsWith("ATM "))) {
                val cleanAtmName = when {
                    atmInfo.startsWith("ATM-") -> atmInfo.substring(4)
                    atmInfo.startsWith("ATM ") -> atmInfo.substring(4)
                    else -> atmInfo
                }.trim()

                val finalAtmName =
                    cleanAtmName.replace(Regex("""^\d+"""), "").replace(".", "").trim()

                if (finalAtmName.isNotEmpty()) {
                    return "ATM Withdrawal: $finalAtmName"
                }
            }
        }

        if (message.contains("deposited via ATM", ignoreCase = true)) {
            val depositPattern = Regex("""at\s+([^.\n]+)""", RegexOption.IGNORE_CASE)
            depositPattern.find(message.substringAfter("deposited via ATM"))?.let { match ->
                return "ATM Deposit: ${match.groupValues[1].trim()}"
            }
        }

        if (message.contains("transferred via", ignoreCase = true)) {
            return "Transfer via ADCB Banking"
        }

        if (message.contains("Cr. transaction", ignoreCase = true)) {
            return "Account Credit"
        }

        if (message.contains("Dr. transaction", ignoreCase = true)) {
            return "Account Debit"
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val adcbPatterns = listOf(
            Regex(
                """debit card\s+[X\*]+(\d{4})\s+linked to acc\.?\s*[X\*]+(\d{6})""",
                RegexOption.IGNORE_CASE
            ),

            Regex("""linked to acc\.?\s*[X\*]+(\d{6})""", RegexOption.IGNORE_CASE),

            Regex("""withdrawn from acc\.?\s*[X\*]+(\d{6})""", RegexOption.IGNORE_CASE),

            Regex("""in your account\s+[X\*]+(\d{6})""", RegexOption.IGNORE_CASE),

            Regex("""from acc\.?\s*no\.?\s*[X\*]+(\d{6})""", RegexOption.IGNORE_CASE),

            Regex("""account (?:number\s*)?[X\*]+(\d{6})""", RegexOption.IGNORE_CASE),

            Regex("""on your account number\s+[X\*]+(\d{6})""", RegexOption.IGNORE_CASE),

            Regex(
                """debit card\s+[X\*]+(\d{4})\s+linked to acc\.?\s*[X\*]+(\d{4})""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""withdrawn from acc\.?\s*[X\*]+(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""in your account\s+[X\*]+(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""from acc\.?\s*no\.?\s*[X\*]+(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""account (?:number\s*)?[X\*]+(\d{4})""", RegexOption.IGNORE_CASE),

            Regex("""Card\s+[X\*]+(\d{4})""", RegexOption.IGNORE_CASE)
        )

        for (pattern in adcbPatterns) {
            pattern.find(message)?.let { match ->
                val accountNumber = when {
                    match.groupValues.size > 2 && match.groupValues[2].isNotEmpty() -> {
                        match.groupValues[2]
                    }
                    match.groupValues[1].isNotEmpty() -> {
                        match.groupValues[1]
                    }

                    else -> null
                }

                if (accountNumber != null && accountNumber.isNotEmpty()) {
                    return accountNumber
                }
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val adcbBalancePatterns = listOf(
            Regex("""Avl\.Bal\s+([A-Z]{3})\s+([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),

            Regex(
                """Available balance is\s+([A-Z]{3})?\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),

            Regex(
                """Avl\.?\s*bal\.?\s+([A-Z]{3})\s+([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),

            Regex("""Avl\.Bal\.?([A-Z]{3})([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),

            Regex(
                """Available Balance is\s+([A-Z]{3})([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            )
        )

        for (pattern in adcbBalancePatterns) {
            pattern.find(message)?.let { match ->
                val balanceStr =
                    if (match.groupValues.size > 2) match.groupValues[2] else match.groupValues[1]
                return try {
                    BigDecimal(balanceStr.replace(",", ""))
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }

        return super.extractBalance(message)
    }

    override fun extractReference(message: String): String? {
        val adcbReferencePatterns = listOf(
            Regex("""on\s+(\w{3}\s+\d{1,2}\s+\d{4}\s+\d{1,2}:\d{2}[AP]M)"""),

            Regex("""on\s+(\w{3}\s+\d{1,2}\s+\d{4}\s+\d{1,2}:\d{2}[AP]M)"""),

            Regex("""(\d{2}/\d{2}/\d{2}\s+\d{2}:\d{2})""")
        )

        for (pattern in adcbReferencePatterns) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1]
            }
        }

        return super.extractReference(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            containsCardPurchase(message) -> TransactionType.EXPENSE

            lowerMessage.contains("withdrawn from") && lowerMessage.contains("atm") -> TransactionType.EXPENSE

            lowerMessage.contains("deposited via atm") -> TransactionType.INCOME

            lowerMessage.contains("transferred via") -> TransactionType.TRANSFER

            lowerMessage.contains("cr. transaction") -> TransactionType.INCOME

            lowerMessage.contains("dr. transaction") -> TransactionType.EXPENSE

            lowerMessage.contains("touchpoints redemption") -> TransactionType.EXPENSE

            else -> super.extractTransactionType(message)
        }
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val adcbNonTransactionKeywords = listOf(
            "could not be completed",
            "insufficient funds",
            "transaction.*could not be completed",

            "do not share your otp",
            "otp for transaction",
            "activation key",
            "do not share with anyone",

            "has been de-activated",
            "has been activated",
            "congratulations on the first usage",
            "digital card assigned to",

            "pin change/setup was successful",
            "request for pin change/setup",
            "we have updated your emirates id",
            "confirmation recd. from",
            "sr no.",
            "for clarifications please call",
            "for assistance please call"
        )

        if (adcbNonTransactionKeywords.any { keyword ->
                lowerMessage.contains(Regex(keyword, RegexOption.IGNORE_CASE))
            }) {
            return false
        }

        val adcbTransactionKeywords = listOf(
            "your debit card",
            "your credit card",
            "was used for",
            "used for",
            "withdrawn from",
            "deposited via atm",
            "transferred via",
            "cr. transaction",
            "dr. transaction",
            "cr.transaction",
            "dr.transaction",
            "transaction.*was successful",
            "touchpoints redemption",
            "debit card.*used for",
            "touchpoints redemption request",
            "account number XXX.*was successful"
        )

        if (adcbTransactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }

    override fun extractCurrency(message: String): String? {

        val transactionCurrencyPatterns = listOf(
            Regex("""was used for\s+([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?""", RegexOption.IGNORE_CASE),

            Regex("""used for\s+([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?""", RegexOption.IGNORE_CASE),

            Regex(
                """\b([A-Z]{3})\s*[0-9,]+(?:\.\d{2})?\s+withdrawn from""",
                RegexOption.IGNORE_CASE
            ),

            Regex(
                """\b([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?\s+has been deposited via ATM""",
                RegexOption.IGNORE_CASE
            ),

            Regex(
                """\b([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?\s+transferred via""",
                RegexOption.IGNORE_CASE
            ),

            Regex(
                """Cr\.?\s*transaction of\s+([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?""",
                RegexOption.IGNORE_CASE
            ),

            Regex(
                """Dr\.?\s*transaction of\s+([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?""",
                RegexOption.IGNORE_CASE
            ),

            Regex("""Transaction of\s+([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?""", RegexOption.IGNORE_CASE),

            Regex("""Amount Paid:\s*([A-Z]{3})\s+[0-9,]+(?:\.\d{2})?""", RegexOption.IGNORE_CASE)
        )

        for (pattern in transactionCurrencyPatterns) {
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

        if (containsCardPurchase(message)) {
            val afterUsage = if (message.contains("was used for", ignoreCase = true)) {
                message.substringAfter("was used for")
            } else {
                message.substringAfter("used for")
            }
            val beforeBalance =
                afterUsage.substringBefore(" Avl.Bal").substringBefore(" Available balance")
            val currencyPattern = Regex("""([A-Z]{3})\s*[0-9,]+(?:\.\d{2})?""")
            currencyPattern.find(beforeBalance)?.let { match ->
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