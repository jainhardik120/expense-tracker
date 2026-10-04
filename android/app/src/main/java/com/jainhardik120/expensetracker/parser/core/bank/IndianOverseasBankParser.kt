package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class IndianOverseasBankParser : BankParser() {

    override fun getBankName() = "Indian Overseas Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("IOB") ||
                normalizedSender.contains("IOBCHN")
    }

    override fun extractAmount(message: String): BigDecimal? {
        val amountPatterns = listOf(
            Regex("""credited\s+by\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""debited\s+by\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""debited\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in amountPatterns) {
            pattern.find(message)?.let { match ->
                val amount = match.groupValues[1].replace(",", "")
                return try {
                    BigDecimal(amount)
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
            lowerMessage.contains("credited by") -> TransactionType.INCOME
            lowerMessage.contains("credited with") -> TransactionType.INCOME
            lowerMessage.contains("is credited") -> TransactionType.INCOME

            lowerMessage.contains("debited by") -> TransactionType.EXPENSE
            lowerMessage.contains("debited for") -> TransactionType.EXPENSE
            lowerMessage.contains("is debited") -> TransactionType.EXPENSE

            else -> super.extractTransactionType(message)
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val upiPayerPattern = Regex(
            """from\s+([^(]+?)(?:\(UPI|$)""",
            RegexOption.IGNORE_CASE
        )
        upiPayerPattern.find(message)?.let { match ->
            val payer = match.groupValues[1].trim()

            if (payer.contains("@")) {
                val parts = payer.split("-")
                return if (parts.size >= 2) {
                    val name = cleanMerchantName(parts[0].trim())
                    val upiId = parts[1].trim()
                    "UPI - $name ($upiId)"
                } else {
                    "UPI - ${cleanMerchantName(payer)}"
                }
            } else {
                val cleanedPayer = cleanMerchantName(payer)
                if (isValidMerchantName(cleanedPayer)) {
                    return cleanedPayer
                }
            }
        }

        val remarkPattern = Regex(
            """Payer\s+Remark\s*-\s*([^-]+)""",
            RegexOption.IGNORE_CASE
        )
        remarkPattern.find(message)?.let { match ->
            val remark = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(remark) && !remark.equals("Paid via Supe", ignoreCase = true)) {
                return remark
            }
        }

        if (message.contains("debited", ignoreCase = true)) {
            val toPattern = Regex(
                """(?:to|for)\s+([^,.-]+)""",
                RegexOption.IGNORE_CASE
            )
            toPattern.find(message)?.let { match ->
                val merchant = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(merchant)) {
                    return merchant
                }
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPattern = Regex(
            """a/c\s+no\.\s+[X]*(\d{2,4})""",
            RegexOption.IGNORE_CASE
        )
        accountPattern.find(message)?.let { match ->
            val digits = match.groupValues[1]
            return if (digits.length >= 4) digits.takeLast(4) else digits
        }

        return super.extractAccountLast4(message)
    }

    override fun extractReference(message: String): String? {
        val upiRefPattern = Regex(
            """\(UPI\s+Ref\s+no\s+(\d+)\)""",
            RegexOption.IGNORE_CASE
        )
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val altUpiRefPattern = Regex(
            """UPI\s+Ref\s+no\s+(\d+)""",
            RegexOption.IGNORE_CASE
        )
        altUpiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("verification") ||
            lowerMessage.contains("request") ||
            lowerMessage.contains("failed")
        ) {
            return false
        }

        if (lowerMessage.contains("is credited by") ||
            lowerMessage.contains("is debited by") ||
            lowerMessage.contains("credited with") ||
            lowerMessage.contains("debited for")
        ) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}