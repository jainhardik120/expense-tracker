package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType

class SliceParser : BankParser() {

    override fun getBankName() = "Slice"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("SLICE") ||
                normalizedSender.contains("SLICEIT") ||
                normalizedSender.contains("SLCEIT")
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("sent")) {
            return true
        }

        return super.isTransactionMessage(message)
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val lowerMessage = message.lowercase()

        val sentToPattern = Regex("""sent.*to\s+([A-Z][A-Z0-9\s./&-]+?)\s*\(""", RegexOption.IGNORE_CASE)
        sentToPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            if (merchant.isNotEmpty()) {
                return cleanMerchantName(merchant)
            }
        }

        val fromPattern =
            Regex("""from\s+([A-Z][A-Z0-9\s]+?)(?:\s+on|\s+\(|$)""", RegexOption.IGNORE_CASE)
        fromPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            if (merchant.isNotEmpty() && !merchant.equals("NEFT", ignoreCase = true)) {
                return cleanMerchantName(merchant)
            }
        }

        return when {
            lowerMessage.contains("paypal") -> "PayPal"
            lowerMessage.contains("slice") && lowerMessage.contains("credited") -> "Slice Credit"
            else -> super.extractMerchant(message, sender) ?: "Slice"
        }
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("credited") -> TransactionType.INCOME
            lowerMessage.contains("received") -> TransactionType.INCOME
            lowerMessage.contains("cashback") -> TransactionType.INCOME
            lowerMessage.contains("refund") -> TransactionType.INCOME

            lowerMessage.contains("debited") -> TransactionType.CREDIT
            lowerMessage.contains("spent") -> TransactionType.CREDIT
            lowerMessage.contains("paid") -> TransactionType.CREDIT
            lowerMessage.contains("sent") -> TransactionType.CREDIT
            lowerMessage.contains("payment") && !lowerMessage.contains("received") -> TransactionType.CREDIT

            else -> super.extractTransactionType(message)
        }
    }
}
