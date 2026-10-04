package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class CBEBankParser : BankParser() {

    override fun getBankName() = "Commercial Bank of Ethiopia"

    override fun getCurrency() = "ETB"

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()
        return upperSender == "CBE" ||
                upperSender.contains("COMMERCIALBANK") ||
                upperSender.contains("CBEBANK") ||
                upperSender.matches(Regex("""^[A-Z]{2}-CBE-[A-Z]$"""))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val patterns = listOf(
            Regex("""ETB\s+([0-9,]+(?:\.[0-9]{2})?)\s""", RegexOption.IGNORE_CASE),
            Regex("""ETB\s*([0-9,]+(?:\.[0-9]{2})?)(?:\s|$|\.)""", RegexOption.IGNORE_CASE),
            Regex(
                """(?:Credited|debited|transfered)\s+(?:with\s+)?ETB\s+([0-9,]+(?:\.[0-9]{2})?)""",
                RegexOption.IGNORE_CASE
            )
        )

        for (pattern in patterns) {
            pattern.find(message)?.let { match ->
                val amountStr = match.groupValues[1].replace(",", "")
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
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("has been credited") -> TransactionType.INCOME
            lowerMessage.contains("credited with") -> TransactionType.INCOME

            lowerMessage.contains("has been debited") -> TransactionType.EXPENSE
            lowerMessage.contains("debited with") -> TransactionType.EXPENSE

            lowerMessage.contains("you have transfered") -> TransactionType.EXPENSE
            lowerMessage.contains("transferred") -> TransactionType.EXPENSE

            else -> null
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val fromPattern = Regex("""from\s+([^,\s]+\*{0,3}[^,\s]*)""", RegexOption.IGNORE_CASE)
        fromPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            if (merchant.isNotEmpty()) {
                return cleanMerchantName(merchant.replace("*", ""))
            }
        }

        val toPattern = Regex("""to\s+([^,\s]+\*{0,5}[^,\s]*)""", RegexOption.IGNORE_CASE)
        toPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            if (merchant.isNotEmpty()) {
                return cleanMerchantName(merchant.replace("*", ""))
            }
        }

        if (message.contains("s.charge", ignoreCase = true) ||
            message.contains("service charge", ignoreCase = true)
        ) {
            return "Service Charge"
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPattern = Regex("""Account\s+\d?\*+(\d{4})""", RegexOption.IGNORE_CASE)
        accountPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val yourAccountPattern = Regex("""your account\s+\d?\*+(\d{4})""", RegexOption.IGNORE_CASE)
        yourAccountPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern =
            Regex("""Current Balance is ETB\s+([0-9,]+(?:\.[0-9]{2})?)""", RegexOption.IGNORE_CASE)
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

    override fun extractReference(message: String): String? {
        val refPattern = Regex("""Ref No\s+(\*{0,9}[A-Z0-9]+)""", RegexOption.IGNORE_CASE)
        refPattern.find(message)?.let { match ->
            val ref = match.groupValues[1].replace("*", "")
            if (ref.isNotEmpty()) {
                return ref
            }
        }

        val urlIdPattern = Regex("""id=([A-Z0-9]+)""", RegexOption.IGNORE_CASE)
        urlIdPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val dateTimePattern =
            Regex("""on\s+(\d{2}/\d{2}/\d{4}\s+at\s+\d{2}:\d{2}:\d{2})""", RegexOption.IGNORE_CASE)
        dateTimePattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val cbeTransactionKeywords = listOf(
            "dear",
            "your account",
            "has been credited",
            "has been debited",
            "you have transfered",
            "current balance",
            "thank you for banking with cbe",
            "etb"
        )

        if (cbeTransactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}