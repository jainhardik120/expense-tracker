package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class MPESAParser : BankParser() {

    override fun getBankName() = "M-PESA"

    override fun getCurrency() = "KES"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("MPESA") ||
                normalizedSender.contains("M-PESA") ||
                normalizedSender == "MPESA" ||
                normalizedSender == "M-PESA"
    }

    override fun extractAmount(message: String): BigDecimal? {
        val amountPattern = Regex(
            """Ksh([0-9,]+(?:\.[0-9]{2})?)\s+(?:paid|sent|received)""",
            RegexOption.IGNORE_CASE
        )
        amountPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val receivedPattern = Regex(
            """received\s+Ksh([0-9,]+(?:\.[0-9]{2})?)""",
            RegexOption.IGNORE_CASE
        )
        receivedPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return null
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("you have received") ||
            lowerMessage.contains("received ksh")
        ) {
            return TransactionType.INCOME
        }

        if (lowerMessage.contains("paid to") ||
            lowerMessage.contains("sent to")
        ) {
            return TransactionType.EXPENSE
        }

        return null
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val paidToPattern = Regex(
            """paid to\s+(.+?)\s+\d+\.\s+on""",
            RegexOption.IGNORE_CASE
        )
        paidToPattern.find(message)?.let { match ->
            var merchant = match.groupValues[1].trim()
            merchant = cleanMerchantName(merchant)
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val sentToPhonePattern = Regex(
            """sent to\s+(.+?)\s+0\d{3}\s+\d{3}\s+\d{3}""",
            RegexOption.IGNORE_CASE
        )
        sentToPhonePattern.find(message)?.let { match ->
            var merchant = match.groupValues[1].trim()
            merchant = cleanMerchantName(merchant)
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val sentToAccountPattern = Regex(
            """sent to\s+(.+?)\s+for account""",
            RegexOption.IGNORE_CASE
        )
        sentToAccountPattern.find(message)?.let { match ->
            var merchant = match.groupValues[1].trim()
            merchant = cleanMerchantName(merchant)
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val receivedFromPattern = Regex(
            """received\s+(?:Ksh[0-9,]+(?:\.[0-9]{2})?\s+)?from\s+(.+?)\s+on""",
            RegexOption.IGNORE_CASE
        )
        receivedFromPattern.find(message)?.let { match ->
            var merchant = match.groupValues[1].trim()
            merchant = merchant.removeSuffix(".").trim()
            merchant = merchant.replace(Regex("""\s+0\d{10}$"""), "")
            merchant = merchant.replace(Regex("""\s+\d{6,}$"""), "").trim()

            merchant = cleanMerchantName(merchant)
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val fromPattern = Regex(
            """from\s+([^.]+)\.\s+on""",
            RegexOption.IGNORE_CASE
        )
        fromPattern.find(message)?.let { match ->
            var merchant = match.groupValues[1].trim()
            merchant = merchant.replace(Regex("""\s+0\d{10}$"""), "")

            merchant = cleanMerchantName(merchant)
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        return null
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
            """New M-PESA balance is Ksh([0-9,]+(?:\.[0-9]{2})?)""",
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

        return null
    }

    override fun extractReference(message: String): String? {
        val txnIdPattern = Regex(
            """^([A-Z0-9]{10})\s+Confirmed""",
            RegexOption.IGNORE_CASE
        )
        txnIdPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val txnIdAltPattern = Regex(
            """^([A-Z0-9]{10})\s+Confirmed\.""",
            RegexOption.IGNORE_CASE
        )
        txnIdAltPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val congratsPattern = Regex(
            """Congratulations!\s+([A-Z0-9]{10})\s+confirmed""",
            RegexOption.IGNORE_CASE
        )
        congratsPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return null
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (!lowerMessage.contains("confirmed")) {
            return false
        }

        val transactionKeywords = listOf(
            "paid to",
            "sent to",
            "received",
            "new m-pesa balance"
        )

        return transactionKeywords.any { lowerMessage.contains(it) }
    }

    override fun cleanMerchantName(merchant: String): String {
        return merchant
            .replace(Regex("""\s*\(.*?\)\s*$"""), "")
            .replace(Regex("""\s+Ref\s+No.*""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s+on\s+\d{2}.*"""), "")
            .replace(Regex("""\s+UPI.*""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s+at\s+\d{2}:\d{2}.*"""), "")
            .replace(Regex("""\s*-\s*$"""), "")
            .trim()
    }
}
