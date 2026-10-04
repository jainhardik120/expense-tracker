package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class HuntingtonBankParser : BankParser() {

    override fun getBankName() = "Huntington Bank"

    override fun getCurrency() = "USD"

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()
        return upperSender.contains("HUNTINGTON") ||
                upperSender == "HUNTINGTON BANK" ||
                upperSender.matches(Regex("""^[A-Z]{2}-HUNTINGTON-[A-Z]$"""))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val withdrawalPattern = Regex(
            """withdrawal:\s+\$([0-9,]+(?:\.\d{2})?)\s+at""",
            RegexOption.IGNORE_CASE
        )
        withdrawalPattern.find(message)?.let { match ->
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
            lowerMessage.contains("withdrawal") -> TransactionType.EXPENSE
            lowerMessage.contains("debit card withdrawal") -> TransactionType.EXPENSE
            lowerMessage.contains("atm withdrawal") -> TransactionType.EXPENSE
            lowerMessage.contains("ach withdrawal") -> TransactionType.EXPENSE
            else -> super.extractTransactionType(message)
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val merchantPattern = Regex(
            """at\s+(.+?)\.\s+Acct""",
            RegexOption.IGNORE_CASE
        )
        merchantPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPattern = Regex(
            """Acct\s+CK(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        accountPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val endingPattern = Regex(
            """account\s+ending\s+(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        endingPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
            """has\s+a\s+(-?\$[0-9,]+(?:\.\d{2})?)\s+bal""",
            RegexOption.IGNORE_CASE
        )
        balancePattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace("$", "").replace(",", "")
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

        if (lowerMessage.contains("heads up") && !lowerMessage.contains("withdrawal")) {
            return false
        }

        val huntingtonTransactionKeywords = listOf(
            "we processed a debit card withdrawal",
            "we processed an atm withdrawal",
            "we processed an ach withdrawal"
        )

        if (huntingtonTransactionKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }

    override fun detectIsCard(message: String): Boolean {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("debit card withdrawal") -> true
            lowerMessage.contains("atm withdrawal") -> true
            lowerMessage.contains("ach withdrawal") -> false
            else -> super.detectIsCard(message)
        }
    }
}
