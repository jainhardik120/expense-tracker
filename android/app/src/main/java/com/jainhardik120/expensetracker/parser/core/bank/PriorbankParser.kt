package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class PriorbankParser : BankParser() {

    override fun getBankName() = "Priorbank"

    override fun getCurrency() = "BYN"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("PRIORBANK") ||
                normalizedSender == "PRIORBANK"
    }

    override fun extractAmount(message: String): BigDecimal? {
        val oplataPattern = Regex(
            """Oplata\s+([0-9]+(?:\.\d{2})?)\s+BYN""",
            RegexOption.IGNORE_CASE
        )
        oplataPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1]
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

        if (lowerMessage.contains("oplata")) {
            return TransactionType.EXPENSE
        }

        if (lowerMessage.contains("popolnenie") || lowerMessage.contains("zachislenie")) {
            return TransactionType.INCOME
        }

        return null
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val quotedPattern = Regex(
            """"([^"]+)"""",
            RegexOption.IGNORE_CASE
        )
        quotedPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val locationPattern = Regex(
            """BYN\.\s+([^.]+?)\.\s+Dostupno""",
            RegexOption.IGNORE_CASE
        )
        locationPattern.find(message)?.let { match ->
            var merchant = match.groupValues[1].trim()

            merchant = merchant.replace(Regex("""^BLR\s+"""), "")

            merchant = cleanMerchantName(merchant)
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        return null
    }

    override fun extractAccountLast4(message: String): String? {
        val kartaPattern = Regex(
            """Karta\s+[6-9][\*]+(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        kartaPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return null
    }

    override fun extractBalance(message: String): BigDecimal? {
        val dostupnoPattern = Regex(
            """Dostupno:\s+([0-9]+(?:\.\d{2})?)\s+BYN""",
            RegexOption.IGNORE_CASE
        )
        dostupnoPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1]
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return null
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("kod") ||
            lowerMessage.contains("parol")
        ) {
            return false
        }

        val transactionKeywords = listOf(
            "oplata",
            "karta",
            "dostupno"
        )

        return transactionKeywords.any { lowerMessage.contains(it) }
    }
}
