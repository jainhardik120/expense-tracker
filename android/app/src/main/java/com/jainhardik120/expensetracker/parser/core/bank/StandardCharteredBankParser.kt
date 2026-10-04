package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class StandardCharteredBankParser : BankParser() {

    override fun getBankName() = "Standard Chartered Bank"

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()
        return upperSender.contains("SCBANK") ||
                upperSender.contains("STANCHART") ||
                upperSender.contains("STANDARDCHARTERED") ||
                upperSender.contains("STANDARD CHARTERED") ||
                upperSender.matches(Regex("""^[A-Z]{2}-SCBANK-[A-Z]$"""))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val debitPattern = Regex(
            """is debited for Rs\.\s*([0-9,]+(?:\.\d{2})?)""",
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

        val neftCreditPattern = Regex(
            """(?:NEFT|RTGS|IMPS)\s+credit\s+of\s+INR\s+([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        neftCreditPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val creditPattern = Regex(
            """is credited for Rs\.\s*([0-9,]+(?:\.\d{2})?)""",
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

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("is debited for") -> TransactionType.EXPENSE
            lowerMessage.contains("neft credit") -> TransactionType.INCOME
            lowerMessage.contains("rtgs credit") -> TransactionType.INCOME
            lowerMessage.contains("imps credit") -> TransactionType.INCOME
            lowerMessage.contains("is credited for") -> TransactionType.INCOME
            else -> super.extractTransactionType(message)
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val upiTransferPattern = Regex(
            """and credited to a/c ([X\*]+\d+)""",
            RegexOption.IGNORE_CASE
        )
        upiTransferPattern.find(message)?.let { match ->
            val accountNum = match.groupValues[1]
            return "UPI Transfer to $accountNum"
        }

        if (message.lowercase().contains("neft credit")) {
            return "NEFT Credit"
        }
        if (message.lowercase().contains("rtgs credit")) {
            return "RTGS Credit"
        }
        if (message.lowercase().contains("imps credit")) {
            return "IMPS Credit"
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val acPattern = Regex(
            """Your a/c ([X\*]+)(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        acPattern.find(message)?.let { match ->
            return match.groupValues[2]
        }

        val accountPattern = Regex(
            """in your account (?:\d+[xX\*]+)?(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        accountPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractReference(message: String): String? {
        val upiRefPattern = Regex(
            """UPI Ref no (\d+)""",
            RegexOption.IGNORE_CASE
        )
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
            """Available Balance:\s*INR\s+([0-9,]+(?:\.\d{2})?)""",
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

        if (lowerMessage.contains("is debited for") ||
            lowerMessage.contains("is credited for") ||
            lowerMessage.contains("neft credit") ||
            lowerMessage.contains("rtgs credit") ||
            lowerMessage.contains("imps credit")
        ) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}
