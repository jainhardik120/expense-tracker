package com.jainhardik120.expensetracker.parser.core.bank

import java.math.BigDecimal

class KarnatakaBankParser : BankParser() {

    override fun getBankName() = "Karnataka Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("KARNATAKA BANK") ||
                normalizedSender.contains("KARNATAKABANK") ||
                normalizedSender.contains("KBLBNK") ||
                normalizedSender.contains("KTKBANK") ||
                normalizedSender.contains("KARBANK") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-KBLBNK-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-KARBANK-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-KBLBNK$")) ||
                normalizedSender == "KBLBNK" ||
                normalizedSender == "KARBANK"
    }

    override fun extractAmount(message: String): BigDecimal? {
        val debitPattern = Regex(
            """DEBITED\s+for\s+Rs\.?([0-9,]+(?:\.\d{2})?)/?\-?""",
            RegexOption.IGNORE_CASE
        )
        debitPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val creditPattern = Regex(
            """credited\s+by\s+Rs\.?([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        creditPattern.find(message)?.let { match ->
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
        val achPattern = Regex(
            """ACH[A-Za-z]*-([^/]+)/""",
            RegexOption.IGNORE_CASE
        )
        achPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val fromPattern = Regex(
            """from\s+([^\s]+)\s+on""",
            RegexOption.IGNORE_CASE
        )
        fromPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val lowerMessage = message.lowercase()
        return when {
            lowerMessage.contains("lic of india") -> "LIC of India"
            lowerMessage.contains("upi") && fromPattern.find(message) == null -> "UPI Transaction"
            else -> super.extractMerchant(message, sender)
        }
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPattern1 = Regex(
            """Account\s+[xX]*([0-9]{4,6})[xX]*""",
            RegexOption.IGNORE_CASE
        )
        accountPattern1.find(message)?.let { match ->
            val digits = match.groupValues[1]
            return if (digits.length > 4) {
                digits.takeLast(4)
            } else {
                digits
            }
        }

        val accountPattern2 = Regex(
            """a/c\s+[xX]{0,2}([0-9]{4,6})""",
            RegexOption.IGNORE_CASE
        )
        accountPattern2.find(message)?.let { match ->
            return match.groupValues[1].takeLast(4)
        }

        return super.extractAccountLast4(message)
    }

    override fun extractReference(message: String): String? {
        val upiRefPattern = Regex(
            """UPI\s+Ref\s+no\s+([0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
            """Balance\s+is\s+Rs\.?([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        balancePattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractBalance(message)
    }
}
