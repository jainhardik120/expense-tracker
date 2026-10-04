package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class IPPBParser : BankParser() {

    override fun getBankName() = "India Post Payments Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()

        return normalizedSender.matches(Regex("^[A-Z]{2}-IPBMSG-[ST]$"))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val amountPattern = Regex(
            """Rs\.?\s*([\d,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
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

    override fun extractAccountLast4(message: String): String? {
        val accountPattern = Regex(
            """[Aa]/[Cc]\s+X?(\d+)""",
            RegexOption.IGNORE_CASE
        )
        accountPattern.find(message)?.let { match ->
            val accountNumber = match.groupValues[1]
            return if (accountNumber.length >= 4) {
                accountNumber.takeLast(4)
            } else {
                accountNumber
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePattern = Regex(
            """Avl\s+Bal\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)""",
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

    override fun extractMerchant(message: String, sender: String): String? {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("debit")) {
            val toPattern = Regex(
                """to\s+([^\s]+(?:@[^\s]+)?)""",
                RegexOption.IGNORE_CASE
            )
            toPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                return if (merchant.contains("@")) {
                    val name = merchant.substringBefore("@")
                    cleanMerchantName(name)
                } else {
                    cleanMerchantName(merchant)
                }
            }

            if (lowerMessage.contains("for upi")) {
                return "UPI Payment"
            }
        }

        if (lowerMessage.contains("received a payment")) {
            val fromPattern = Regex(
                """from\s+(.+?)\s+thru""",
                RegexOption.IGNORE_CASE
            )
            fromPattern.find(message)?.let { match ->
                val sender = match.groupValues[1].trim()
                return cleanMerchantName(sender)
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractReference(message: String): String? {
        val refPattern = Regex(
            """Ref\s+(\d+)""",
            RegexOption.IGNORE_CASE
        )
        refPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val infoPattern = Regex(
            """Info:\s*UPI/[^/]+/(\d+)""",
            RegexOption.IGNORE_CASE
        )
        infoPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("debit") -> TransactionType.EXPENSE
            lowerMessage.contains("received a payment") -> TransactionType.INCOME
            lowerMessage.contains("credit") && lowerMessage.contains("info: upi/credit") -> TransactionType.INCOME
            else -> super.extractTransactionType(message)
        }
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("debit rs") ||
            lowerMessage.contains("received a payment") ||
            (lowerMessage.contains("info: upi") && lowerMessage.contains("credit"))
        ) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}