package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal
import java.time.LocalDateTime

class SouthIndianBankParser : BaseIndianBankParser() {

    override fun getBankName() = "South Indian Bank"

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()

        val sibSenders = setOf(
            "SIBSMS",
            "AD-SIBSMS",
            "CP-SIBSMS",
            "SIBSMS-S",
            "AD-SIBSMS-S",
            "CP-SIBSMS-S",
            "SOUTHINDIANBANK",
            "SIBBANK"
        )

        if (upperSender in sibSenders) return true

        if (upperSender.contains("SIBSMS")) return true
        if (upperSender.contains("SIBBANK")) return true

        return upperSender.startsWith("AD-SIB") ||
                upperSender.startsWith("CP-SIB") ||
                upperSender.startsWith("VM-SIB")
    }

    override fun parse(smsBody: String, sender: String, timestamp: Long): ParsedTransaction? {
        if (!isTransactionMessage(smsBody)) {
            return null
        }

        val amount = extractAmount(smsBody) ?: return null

        val transactionType = extractTransactionType(smsBody) ?: return null

        val merchant = extractMerchant(smsBody, sender) ?: "Unknown"
        val reference = extractReference(smsBody)
        val accountLast4 = extractAccountLast4(smsBody)
        val balance = extractBalance(smsBody)

        val dateTime = extractDateTime(smsBody) ?: LocalDateTime.ofInstant(
            java.time.Instant.ofEpochMilli(timestamp),
            java.time.ZoneId.systemDefault()
        )

        return ParsedTransaction(
            amount = amount,
            type = transactionType,
            merchant = merchant,
            reference = reference,
            accountLast4 = accountLast4,
            balance = balance,
            smsBody = smsBody,
            sender = sender,
            timestamp = timestamp,
            bankName = getBankName()
        )
    }

    override fun extractAmount(message: String): BigDecimal? {
        val patterns = listOf(
            Regex("""(?:Rs\.?|INR)\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
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

        return null
    }

    override fun extractMerchant(message: String, sender: String): String? {
        if (message.contains("IMPS", ignoreCase = true) && message.contains(
                "Info:",
                ignoreCase = true
            )
        ) {
            val impsPattern = Regex("""Info:\s*IMPS/[^/]+/[^/]+/([^.]+)""", RegexOption.IGNORE_CASE)
            impsPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty()) {
                    return cleanMerchantName(merchant)
                }
            }
        }

        if (message.contains("UPI", ignoreCase = true)) {
            val infoPattern =
                Regex("""Info:UPI/[^/]+/[^/]+/([^/]+?)\s+on""", RegexOption.IGNORE_CASE)
            infoPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty()) {
                    return cleanMerchantName(merchant)
                }
            }

            val messagePrefix = message.take(200)
            val toPattern = Regex("""to\s+([^,\s]+@[^\s,]+)""", RegexOption.IGNORE_CASE)
            toPattern.find(messagePrefix)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty()) {
                    return cleanMerchantName(merchant)
                }
            }

            if (message.contains("credit", ignoreCase = true)) {
                val fromPattern = Regex("""from\s+([^,\s]+@[^\s,]+)""", RegexOption.IGNORE_CASE)
                fromPattern.find(messagePrefix)?.let { match ->
                    val merchant = match.groupValues[1].trim()
                    if (merchant.isNotEmpty()) {
                        return cleanMerchantName(merchant)
                    }
                }
                return "UPI Credit"
            }

            return "UPI Transaction"
        }

        if ((message.contains("debit", ignoreCase = true) ||
                    message.contains("credit", ignoreCase = true)) &&
            !message.contains("UPI", ignoreCase = true)) {
            val debitCreditPattern = Regex(
                """(?:DEBIT|CREDIT)[:\s]*Rs\.?\s*[0-9,]+(?:\.\d{2})?\s+([A-Z\s]+?)\s+(?:Bal|Available)""",
                RegexOption.IGNORE_CASE
            )
            debitCreditPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty() && merchant.length > 2) {
                    return cleanMerchantName(merchant)
                }
            }
        }

        if (message.contains("ATM", ignoreCase = true) ||
            message.contains("withdrawn", ignoreCase = true)
        ) {
            return "ATM"
        }

        if (message.contains("card", ignoreCase = true)) {
            val atPattern = Regex("""at\s+([^,\n]+?)(?:\s+on|\s*,|$)""", RegexOption.IGNORE_CASE)
            atPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty()) {
                    return cleanMerchantName(merchant)
                }
            }
        }

        return super.extractMerchant(message, sender)
    }
    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("debit") -> TransactionType.EXPENSE
            lowerMessage.contains("withdrawn") -> TransactionType.EXPENSE
            lowerMessage.contains("spent") -> TransactionType.EXPENSE
            lowerMessage.contains("purchase") -> TransactionType.EXPENSE
            lowerMessage.contains("paid") -> TransactionType.EXPENSE
            lowerMessage.contains("transfer to") -> TransactionType.EXPENSE

            lowerMessage.contains("credit") -> TransactionType.INCOME
            lowerMessage.contains("deposited") -> TransactionType.INCOME
            lowerMessage.contains("received") -> TransactionType.INCOME
            lowerMessage.contains("refund") -> TransactionType.INCOME
            lowerMessage.contains("transfer from") -> TransactionType.INCOME
            lowerMessage.contains("cashback") -> TransactionType.INCOME

            else -> null
        }
    }

    override fun extractReference(message: String): String? {
        if (message.contains("IMPS", ignoreCase = true) && message.contains(
                "Info:",
                ignoreCase = true
            )
        ) {
            val impsRefPattern = Regex("""Info:\s*IMPS/[^/]+/([^/]+)/""", RegexOption.IGNORE_CASE)
            impsRefPattern.find(message)?.let { match ->
                val ref = match.groupValues[1].trim()
                if (ref.isNotEmpty()) {
                    return ref
                }
            }
        }

        val rrnPattern = Regex("""RRN[:\s]*(\d{12})""", RegexOption.IGNORE_CASE)
        rrnPattern.find(message)?.let { match ->
            return match.groupValues[1].trim()
        }

        val refPattern = Regex("""Ref(?:erence)?[:\s]*([A-Z0-9]+)""", RegexOption.IGNORE_CASE)
        refPattern.find(message)?.let { match ->
            return match.groupValues[1].trim()
        }

        return super.extractReference(message)
    }

    override fun extractAccountLast4(message: String): String? {
        val patterns = listOf(
            Regex("""A/c\s+[X*]*(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""Account\s+[X*]*(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""from\s+[X*]*(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""to\s+[X*]*(\d{4})""", RegexOption.IGNORE_CASE)
        )

        for (pattern in patterns) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1]
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val patterns = listOf(
            Regex(
                """Final\s+balance\s+is\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""Bal(?:ance)?[:\s]*Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex(
                """Available\s+Bal(?:ance)?[:\s]*Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""Avl\s+Bal[:\s]*Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in patterns) {
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

    private fun extractDateTime(message: String): LocalDateTime? {
        val dateTimePattern = Regex("""(\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})""")
        dateTimePattern.find(message)?.let { match ->
            val dateStr = match.groupValues[1]
            val timeStr = match.groupValues[2]

            return try {
                val parts = dateStr.split("-")
                if (parts.size == 3) {
                    val year = 2000 + parts[0].toInt()
                    val month = parts[1].toInt()
                    val day = parts[2].toInt()

                    val timeParts = timeStr.split(":")
                    if (timeParts.size == 3) {
                        val hour = timeParts[0].toInt()
                        val minute = timeParts[1].toInt()
                        val second = timeParts[2].toInt()

                        LocalDateTime.of(year, month, day, hour, minute, second)
                    } else {
                        null
                    }
                } else {
                    null
                }
            } catch (e: Exception) {
                null
            }
        }

        return null
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("one time password") ||
            lowerMessage.contains("verification code") ||
            lowerMessage.contains("offer") ||
            lowerMessage.contains("discount")
        ) {
            return false
        }

        if (lowerMessage.contains("upi auto pay") &&
            lowerMessage.contains("is scheduled on")
        ) {
            return false
        }

        val transactionKeywords = listOf(
            "debit", "credit", "withdrawn", "deposited",
            "spent", "received", "transferred", "paid",
            "purchase", "refund", "cashback", "upi"
        )

        return transactionKeywords.any { lowerMessage.contains(it) }
    }
}