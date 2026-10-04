package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class AxisBankParser : BaseIndianBankParser() {

    override fun getBankName() = "Axis Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("AXIS BANK") ||
                normalizedSender.contains("AXISBANK") ||
                normalizedSender.contains("AXISBK") ||
                normalizedSender.contains("AXISB") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-AXISBK-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-AXISBANK-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-AXIS-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-AXISBK$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-AXIS$")) ||
                normalizedSender == "AXISBK" ||
                normalizedSender == "AXISBANK" ||
                normalizedSender == "AXIS"
    }

    override fun extractAmount(message: String): BigDecimal? {
        AUTO_PAY_PROCESSED.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val inrDebitPattern = Regex(
            """INR\s+([0-9,]+(?:\.\d{2})?)\s+debited""",
            RegexOption.IGNORE_CASE
        )
        inrDebitPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val inrCreditPattern = Regex(
            """INR\s+([0-9,]+(?:\.\d{2})?)\s+credited""",
            RegexOption.IGNORE_CASE
        )
        inrCreditPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val paymentPattern = Regex(
            """Payment\s+of\s+INR\s+([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        paymentPattern.find(message)?.let { match ->
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
        AUTO_PAY_PROCESSED.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[2].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val lowerMessage = message.lowercase()
        if (lowerMessage.contains("debited from a/c no.") &&
            lowerMessage.contains(" on axis bank")) {
            return "ATM"
        }

        if ((lowerMessage.contains("atm") || lowerMessage.contains("cash withdrawal")) &&
            lowerMessage.contains("debited")) {
            return "ATM"
        }

        val debitCardPattern = Regex(
            """debited from A/c no\. [^\s]+ on ([^0-9]+?)(?:\d{2}-\d{2}-\d{4})""",
            RegexOption.IGNORE_CASE
        )
        debitCardPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val spentPatternWithIST = Regex(
            """Spent[\s\S]*?IST\s*\n\s*([^\n]+?)(?:\s*\n|\s*Avl Limit:|\s*Avl Lmt|\s*Not you?)""",
            RegexOption.IGNORE_CASE
        )
        spentPatternWithIST.find(message)?.let { match ->
            var merchant = match.groupValues[1].trim()

            merchant = merchant.replace(Regex("""\s+Limi$"""), "")
            merchant = merchant.replace(Regex("""\s+Pay$"""), "")
            merchant = merchant.replace(Regex("""\s+SUPE$"""), "")

            merchant = cleanMerchantName(merchant)
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val spentPatternWithTime = Regex(
            """Spent[\s\S]*?\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*\n\s*([^\n]+?)(?:\s*\n|\s*Avl Limit:|\s*Avl Lmt|\s*Not you?)""",
            RegexOption.IGNORE_CASE
        )
        spentPatternWithTime.find(message)?.let { match ->
            var merchant = match.groupValues[1].trim()

            merchant = merchant.replace(Regex("""\s+Limi$"""), "")
            merchant = merchant.replace(Regex("""\s+Pay$"""), "")
            merchant = merchant.replace(Regex("""\s+SUPE$"""), "")

            merchant = cleanMerchantName(merchant)
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val upiMerchantPattern = Regex(
            """UPI/[^/]+/[^/]+/([^/\n]+)""",
            RegexOption.IGNORE_CASE
        )
        upiMerchantPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].substringBefore("Not you").trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val upiPersonPattern = Regex(
            """UPI/P2A/[^/]+/([^\n]+?)(?:\s*Not you|\s*$)""",
            RegexOption.IGNORE_CASE
        )
        upiPersonPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val infoPattern = Regex(
            """Info\s*[-–]\s*([^.\n]+?)(?:\.\s*Chk|\s*$)""",
            RegexOption.IGNORE_CASE
        )
        infoPattern.find(message)?.let { match ->
            val info = match.groupValues[1].trim()
            return when {
                info.contains("SALARY", ignoreCase = true) -> "Salary"
                else -> cleanMerchantName(info)
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val acNoPattern = Regex(
            """A/c\s+no\.\s+([X\*xX]+[a-zA-Z\d]+)""",
            RegexOption.IGNORE_CASE
        )
        acNoPattern.find(message)?.let { match ->
            val accountStr = match.groupValues[1]
            val digitsAndLetters = accountStr.filter { it.isLetterOrDigit() }

            if (digitsAndLetters.any { it in 'a'..'z' }) {
                return if (digitsAndLetters.length >= 4) {
                    digitsAndLetters.takeLast(4).lowercase()
                } else {
                    digitsAndLetters.lowercase()
                }
            }

            val digitsOnly = accountStr.filter { it.isDigit() }
            return if (digitsOnly.length >= 4) {
                digitsOnly.takeLast(4)
            } else {
                digitsOnly
            }
        }

        val cardNoPattern = Regex(
            """Card\s+no\.\s+([X\*]*\d+)""",
            RegexOption.IGNORE_CASE
        )
        cardNoPattern.find(message)?.let { match ->
            val accountStr = match.groupValues[1]
            val digitsOnly = accountStr.filter { it.isDigit() }
            return if (digitsOnly.length >= 4) {
                digitsOnly.takeLast(4)
            } else {
                digitsOnly
            }
        }

        val creditCardPattern = Regex(
            """Credit\s+Card\s+([X\*]*\d+)""",
            RegexOption.IGNORE_CASE
        )
        creditCardPattern.find(message)?.let { match ->
            val accountStr = match.groupValues[1]
            val digitsOnly = accountStr.filter { it.isDigit() }
            return if (digitsOnly.length >= 4) {
                digitsOnly.takeLast(4)
            } else {
                digitsOnly
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractReference(message: String): String? {
        val upiRefPattern = Regex(
            """UPI/[^/]+/([0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("payment") &&
            lowerMessage.contains("has been received") &&
            lowerMessage.contains("towards your axis bank")
        ) {
            return false
        }

        if (AUTO_PAY_PROCESSED.containsMatchIn(message)) {
            return true
        }

        return super.isTransactionMessage(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        if (AUTO_PAY_PROCESSED.containsMatchIn(message)) {
            return TransactionType.CREDIT
        }

        if (lowerMessage.contains("avl limit") || lowerMessage.contains("avl lmt")) {
            return TransactionType.CREDIT
        }

        if ((lowerMessage.contains("credit card") || lowerMessage.contains(" cc ")) &&
            (lowerMessage.contains("debited") || lowerMessage.contains("spent"))
        ) {
            return TransactionType.CREDIT
        }

        return super.extractTransactionType(message)
    }

    override fun extractAvailableLimit(message: String): BigDecimal? {
        val axisCreditLimitPatterns = listOf(
            Regex("""Avl\s+Limit:?\s*INR\s+([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""Avl\s+Lmt\s+INR\s+([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""Available\s+limit:?\s*INR\s+([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in axisCreditLimitPatterns) {
            pattern.find(message)?.let { match ->
                val limitStr = match.groupValues[1].replace(",", "")
                return try {
                    BigDecimal(limitStr)
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }

        return super.extractAvailableLimit(message)
    }

    private companion object {
        val AUTO_PAY_PROCESSED = Regex(
            """Auto\s*Pay\s+of\s+INR\s+([0-9,]+(?:\.\d{2})?)\s+for\s+(.+?)\s+has\s+been\s+processed""",
            RegexOption.IGNORE_CASE
        )
    }
}