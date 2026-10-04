package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class SaraswatBankParser : BaseIndianBankParser() {

    override fun getBankName() = "Saraswat Co-operative Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()

        val saraswatSenders = setOf(
            "SARBNK",
            "SARASWAT",
            "SARASWATBANK"
        )

        if (normalizedSender in saraswatSenders) return true

        return normalizedSender.matches(Regex("^[A-Z]{2}-SARBNK-[ST]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-SARASWAT-[ST]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-SARBNK$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-SARASWAT$"))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val inrPattern = Regex("""INR\s+(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        inrPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val rsPattern = Regex("""Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        rsPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractAmount(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("is credited") -> TransactionType.INCOME
            lowerMessage.contains("credited with") -> TransactionType.INCOME
            lowerMessage.contains("is debited") -> TransactionType.EXPENSE
            lowerMessage.contains("debited with") -> TransactionType.EXPENSE
            lowerMessage.contains("withdrawn") -> TransactionType.EXPENSE
            else -> super.extractTransactionType(message)
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val towardsPattern =
            Regex("""towards\s+(.+?)(?:\.\s*Current|\s*Current|$)""", RegexOption.IGNORE_CASE)
        towardsPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            val cleanedMerchant = merchant
                .replace(Regex("""^ACH\s+Credit:\s*""", RegexOption.IGNORE_CASE), "")
                .replace(Regex("""^ACH\s+Debit:\s*""", RegexOption.IGNORE_CASE), "")
                .trim()
            if (isValidMerchantName(cleanedMerchant)) {
                return cleanMerchantName(cleanedMerchant)
            }
        }

        val forPattern =
            Regex("""for\s+([A-Z.]+?)(?:\.\s+Current|\s+Current|$)""", RegexOption.IGNORE_CASE)
        forPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim().removeSuffix(".")
            return when (merchant.uppercase()) {
                "S.I" -> "Standing Instruction"
                "SI" -> "Standing Instruction"
                "NEFT" -> "NEFT Transfer"
                "RTGS" -> "RTGS Transfer"
                "IMPS" -> "IMPS Transfer"
                else -> merchant
            }
        }

        if (message.contains("ATM", ignoreCase = true) || message.contains(
                "withdrawn",
                ignoreCase = true
            )
        ) {
            return "ATM Withdrawal"
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val accountNoPattern =
            Regex("""A/c\s+no\.\s+(?:ending\s+with\s+)?(\d{4,6})""", RegexOption.IGNORE_CASE)
        accountNoPattern.find(message)?.let { match ->
            val accountNumber = match.groupValues[1]
            return accountNumber.takeLast(4)
        }

        val endingWithPattern =
            Regex("""account\s+no\.\s+ending\s+with\s+(\d{4,6})""", RegexOption.IGNORE_CASE)
        endingWithPattern.find(message)?.let { match ->
            val accountNumber = match.groupValues[1]
            return accountNumber.takeLast(4)
        }

        val pattern3 = Regex("""A/c\s+\*(\d{4})""", RegexOption.IGNORE_CASE)
        pattern3.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val currentBalPattern = Regex(
            """Current\s+Bal\s+is\s+INR\s+(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:CR|DR)?""",
            RegexOption.IGNORE_CASE
        )
        currentBalPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val balPattern =
            Regex("""Bal[:\s]+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        balPattern.find(message)?.let { match ->
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

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("one time password") ||
            lowerMessage.contains("verification code")
        ) {
            return false
        }

        val saraswatTransactionKeywords = listOf(
            "is credited with",
            "is debited with",
            "credited with inr",
            "debited with inr",
            "current bal is"
        )

        if (saraswatTransactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}
