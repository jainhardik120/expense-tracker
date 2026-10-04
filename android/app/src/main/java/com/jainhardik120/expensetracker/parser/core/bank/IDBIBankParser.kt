package com.jainhardik120.expensetracker.parser.core.bank

import java.math.BigDecimal

class IDBIBankParser : BankParser() {

    override fun getBankName() = "IDBI Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("IDBIBK") ||
                normalizedSender.contains("IDBIBANK") ||
                normalizedSender.contains("IDBI") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-IDBIBK-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-IDBI-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-IDBIBK$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-IDBI$")) ||
                normalizedSender == "IDBIBK" ||
                normalizedSender == "IDBIBANK"
    }

    override fun extractAmount(message: String): BigDecimal? {
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

        val creditPattern = Regex(
            """credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
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

        val creditedMerchantPattern = Regex(
            """;\s*([^.\n]+?)\s+credited\.""",
            RegexOption.IGNORE_CASE
        )
        creditedMerchantPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        if (message.contains("AutoPay", ignoreCase = true) ||
            message.contains("MANDATE", ignoreCase = true)
        ) {
            val merchantPattern = Regex(
                """towards\s+([^.\n]+?)\s+for\s+\w*MANDATE""",
                RegexOption.IGNORE_CASE
            )
            merchantPattern.find(message)?.let { match ->
                return cleanMerchantName(match.groupValues[1].trim())
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val acctPattern = Regex(
            """Acct\s+(?:XX|X\*+)?(\d{3,4})""",
            RegexOption.IGNORE_CASE
        )
        acctPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val bankAcctPattern = Regex(
            """IDBI\s+Bank\s+Acct\s+(?:XX|X\*+)?(\d{3,4})""",
            RegexOption.IGNORE_CASE
        )
        bankAcctPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
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

        return super.extractReference(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
            """Bal\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
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

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("to block upi") && lowerMessage.contains("send sms")) {
        }

        return super.isTransactionMessage(message)
    }
}