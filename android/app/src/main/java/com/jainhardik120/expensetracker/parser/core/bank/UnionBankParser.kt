package com.jainhardik120.expensetracker.parser.core.bank

import java.math.BigDecimal

class UnionBankParser : BaseIndianBankParser() {

    override fun getBankName() = "Union Bank of India"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("UNIONB") ||
                normalizedSender.contains("UNIONBANK") ||
                normalizedSender.contains("UBOI") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-UNIONB-[ST]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-UNIONB-[TPG]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-UNIONB$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-UNIONBANK$"))
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val transactionKeywords = listOf(
            "debited", "credited", "withdrawn", "deposited",
            "spent", "received", "transferred", "paid"
        )

        if (transactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }

    override fun extractAmount(message: String): BigDecimal? {
        val amountPattern1 = Regex("""Rs[:.]?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        amountPattern1.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val amountPattern2 = Regex("""INR\s+([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        amountPattern2.find(message)?.let { match ->
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
        if (message.contains("Mob Bk", ignoreCase = true)) {
            return "Mobile Banking Transfer"
        }

        if (message.contains("ATM", ignoreCase = true)) {
            val atmPattern = Regex(
                """at\s+([^.\s]+(?:\s+[^.\s]+)*)(?:\s+on|\s+Avl|$)""",
                RegexOption.IGNORE_CASE
            )
            atmPattern.find(message)?.let { match ->
                return cleanMerchantName(match.groupValues[1].trim())
            }
            return "ATM Withdrawal"
        }

        if (message.contains("UPI", ignoreCase = true)) {
            val upiPattern = Regex("""UPI[/:]?\s*([^,.\s]+)""", RegexOption.IGNORE_CASE)
            upiPattern.find(message)?.let { match ->
                return cleanMerchantName(match.groupValues[1].trim())
            }
        }

        if (message.contains("VPA", ignoreCase = true)) {
            val vpaPattern = Regex("""VPA\s+([^@\s]+)""", RegexOption.IGNORE_CASE)
            vpaPattern.find(message)?.let { match ->
                val vpaName = match.groupValues[1].trim()
                return parseUPIMerchant(vpaName)
            }
        }

        val toPattern = Regex("""to\s+([^.\n]+?)(?:\s+on|\s+Avl|$)""", RegexOption.IGNORE_CASE)
        toPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            if (!merchant.contains("Avl", ignoreCase = true)) {
                return cleanMerchantName(merchant)
            }
        }

        val fromPattern = Regex("""from\s+([^.\n]+?)(?:\s+on|\s+Avl|$)""", RegexOption.IGNORE_CASE)
        fromPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            if (!merchant.contains("Avl", ignoreCase = true)) {
                return cleanMerchantName(merchant)
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractReference(message: String): String? {
        val refPatterns = listOf(
            Regex("""ref\s+no\s+([\w]+)""", RegexOption.IGNORE_CASE),
            Regex("""ref[:#]?\s*([\w]+)""", RegexOption.IGNORE_CASE),
            Regex("""reference[:#]?\s*([\w]+)""", RegexOption.IGNORE_CASE),
            Regex("""txn[:#]?\s*([\w]+)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in refPatterns) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1].trim()
            }
        }

        return super.extractReference(message)
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPatterns = listOf(
            Regex("""A/[Cc]\s*[*X](\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""Account\s*[*X](\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""Acc\s*[*X](\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""A/[Cc]\s+(\d{4})""", RegexOption.IGNORE_CASE)
        )

        for (pattern in accountPatterns) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1]
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePatterns = listOf(
            Regex("""Avl\s+Bal\s+Rs[:.]?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex(
                """Available\s+Balance[:.]?\s*Rs[:.]?\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""Balance[:.]?\s*Rs[:.]?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""Bal[:.]?\s*Rs[:.]?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in balancePatterns) {
            pattern.find(message)?.let { match ->
                val balanceStr = match.groupValues[1].replace(",", "")
                return try {
                    BigDecimal(balanceStr)
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }

        return super.extractBalance(message)
    }

    private fun parseUPIMerchant(vpa: String): String {
        val cleanVPA = vpa.lowercase()

        return when {
            cleanVPA.contains("paytm") -> "Paytm"
            cleanVPA.contains("phonepe") -> "PhonePe"
            cleanVPA.contains("googlepay") || cleanVPA.contains("gpay") -> "Google Pay"
            cleanVPA.contains("bharatpe") -> "BharatPe"
            cleanVPA.contains("amazon") -> "Amazon"
            cleanVPA.contains("flipkart") -> "Flipkart"
            cleanVPA.contains("swiggy") -> "Swiggy"
            cleanVPA.contains("zomato") -> "Zomato"
            cleanVPA.contains("uber") -> "Uber"
            cleanVPA.contains("ola") -> "Ola"

            cleanVPA.matches(Regex("\\d+")) -> "Individual"

            else -> {
                val parts = cleanVPA.split(".", "-", "_")
                parts.firstOrNull { it.length > 3 && !it.all { char -> char.isDigit() } }
                    ?.replaceFirstChar { it.uppercase() } ?: "Merchant"
            }
        }
    }
}