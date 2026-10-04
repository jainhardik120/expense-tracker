package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class LazyPayParser : BankParser() {

    override fun getBankName() = "LazyPay"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("LZYPAY") ||
                normalizedSender.contains("LAZYPAY")
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val onMerchantPattern =
            Regex("""on\s+([^.]+?)\s+was\s+successful""", RegexOption.IGNORE_CASE)
        onMerchantPattern.find(message)?.let { match ->
            val rawMerchant = match.groupValues[1].trim()
            val cleanedMerchant = when {
                rawMerchant.contains("Zepto Marketplace", ignoreCase = true) -> "Zepto"
                rawMerchant.contains("Innovative Retail Concepts", ignoreCase = true) -> "BigBasket"
                rawMerchant.contains("Swiggy", ignoreCase = true) -> "Swiggy"
                rawMerchant.contains("Zomato", ignoreCase = true) -> "Zomato"
                else -> {
                    rawMerchant
                        .replace(
                            Regex(
                                """\s*(Private|Pvt\.?|Ltd\.?|Limited|Inc\.?|LLC|LLP).*$""",
                                RegexOption.IGNORE_CASE
                            ), ""
                        )
                        .replace(Regex("""\s*\d+$"""), "")
                        .trim()
                }
            }
            if (cleanedMerchant.isNotEmpty()) {
                return cleanedMerchant
            }
        }

        if (message.contains("against your LazyPay statement", ignoreCase = true)) {
            return "LazyPay Repayment"
        }

        return super.extractMerchant(message, sender) ?: "LazyPay"
    }

    override fun extractAmount(message: String): BigDecimal? {
        val amountPatterns = listOf(
            Regex("""Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in amountPatterns) {
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

    override fun extractReference(message: String): String? {
        val txnPattern = Regex("""txn\s+([A-Z0-9]+)""", RegexOption.IGNORE_CASE)
        txnPattern.find(message)?.let { match ->
            return match.groupValues[1].trim()
        }

        return super.extractReference(message)
    }

    override fun extractTransactionType(message: String): TransactionType {
        return TransactionType.CREDIT
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("could not be processed") ||
            lowerMessage.contains("due to a failure") ||
            lowerMessage.contains("payment failed") ||
            lowerMessage.contains("transaction failed") ||
            lowerMessage.contains("unsuccessful")
        ) {
            return false
        }

        if (lowerMessage.contains("offer") ||
            lowerMessage.contains("get cashback") ||
            lowerMessage.contains("explore more")
        ) {
            if (!lowerMessage.contains("payment of") &&
                !lowerMessage.contains("was successful")
            ) {
                return false
            }
        }

        val transactionKeywords = listOf(
            "payment of",
            "was successful",
            "against your lazypay statement",
            "thanks for your payment"
        )

        return transactionKeywords.any { lowerMessage.contains(it) }
    }
}