package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class UCOBankParser : BankParser() {

    override fun getBankName() = "UCO Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("UCOBNK") ||
                normalizedSender.contains("UCOBANK") ||
                normalizedSender.contains("UCO BANK") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-UCOBNK-[ST]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-UCOBNK$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-UCOBANK$"))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val amountPattern = Regex("""Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        amountPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractAmount(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("debited with") -> TransactionType.EXPENSE
            lowerMessage.contains("credited with") -> TransactionType.INCOME
            else -> super.extractTransactionType(message)
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val merchantPattern = Regex("""by\s+([^.]+?)(?:\.Avl|$)""", RegexOption.IGNORE_CASE)
        merchantPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()

            if (merchant.contains("UCO-UPI", ignoreCase = true)) {
                return "UPI Transfer"
            }

            return cleanMerchantName(merchant)
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPatterns = listOf(
            Regex("""A/c\s+[X]{2}(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""Account\s+[X]{2}(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""Acc\s+[X]{2}(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""A/c\s+[*]{2}(\d{4})""", RegexOption.IGNORE_CASE)
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
            Regex("""Avl\s+Bal\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex(
                """Available\s+Balance\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""Balance[:.]?\s*Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
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

    override fun extractReference(message: String): String? {
        val refPatterns = listOf(
            Regex("""ref[:#]?\s*([\w]+)""", RegexOption.IGNORE_CASE),
            Regex("""txn[:#]?\s*([\w]+)""", RegexOption.IGNORE_CASE),
            Regex("""transaction\s+id[:#]?\s*([\w]+)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in refPatterns) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1].trim()
            }
        }

        return super.extractReference(message)
    }
}