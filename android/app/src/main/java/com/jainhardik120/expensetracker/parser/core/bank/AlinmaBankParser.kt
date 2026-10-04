package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class AlinmaBankParser : BankParser() {

    override fun getBankName() = "Alinma Bank"

    override fun getCurrency() = "SAR"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("ALINMA") ||
                normalizedSender == "ALINMA" ||
                normalizedSender.contains("الإنماء")
    }

    override fun extractAmount(message: String): BigDecimal? {
        val amountSARPattern = Regex(
            """بمبلغ:\s*([0-9]+(?:\.[0-9]{2})?)\s*SAR""",
            RegexOption.IGNORE_CASE
        )
        amountSARPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1]
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val amountPattern2 = Regex(
            """مبلغ:\s*SAR\s*([0-9]+(?:\.[0-9]{2})?)""",
            RegexOption.IGNORE_CASE
        )
        amountPattern2.find(message)?.let { match ->
            val amountStr = match.groupValues[1]
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val amountArabicPattern = Regex(
            """مبلغ:\s*ريال سعودى\s*([0-9]+(?:\.[0-9]{2})?)"""
        )
        amountArabicPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1]
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return null
    }

    override fun extractTransactionType(message: String): TransactionType? {
        if (message.contains("شراء") || message.contains("Purchase", ignoreCase = true)) {
            return TransactionType.EXPENSE
        }

        if (message.contains("إيداع") || message.contains("Deposit", ignoreCase = true)) {
            return TransactionType.INCOME
        }

        return null
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val fromPattern = Regex(
            """من:\s*([^\n]+?)(?:\n|في:)""",
            RegexOption.IGNORE_CASE
        )
        fromPattern.find(message)?.let { match ->
            var merchant = match.groupValues[1].trim()

            merchant = cleanMerchantName(merchant)
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val atPattern = Regex(
            """لدى:\s*([^\n]+?)(?:\n|في:)""",
            RegexOption.IGNORE_CASE
        )
        atPattern.find(message)?.let { match ->
            var merchant = match.groupValues[1].trim()

            merchant = cleanMerchantName(merchant)
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        if (message.contains("POS") || message.contains("نقاط البيع")) {
            return "POS Transaction"
        }

        return null
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPattern = Regex(
            """حساب:\s*\*+(\d{4})"""
        )
        accountPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val accountPattern2 = Regex(
            """حساب:\s*\*(\d{4})"""
        )
        accountPattern2.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val cardPattern = Regex(
            """البطاقة:\s*\*+(\d{4})"""
        )
        cardPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val creditCardPattern = Regex(
            """البطاقة الائتمانية:\s*\*+(\d{4})"""
        )
        creditCardPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val madaPattern = Regex(
            """بطاقة مدى:\s*(\d{4})\*"""
        )
        madaPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return null
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balanceSARPattern = Regex(
            """الرصيد:\s*([0-9]+(?:\.[0-9]{2})?)\s*SAR""",
            RegexOption.IGNORE_CASE
        )
        balanceSARPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1]
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val balanceRiyalPattern = Regex(
            """الرصيد:\s*([0-9]+(?:\.[0-9]{2})?)\s*ريال"""
        )
        balanceRiyalPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1]
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return null
    }

    override fun isTransactionMessage(message: String): Boolean {
        if (message.contains("OTP", ignoreCase = true) ||
            message.contains("رمز", ignoreCase = true) ||
            message.contains("كلمة المرور")
        ) {
            return false
        }

        val transactionKeywords = listOf(
            "شراء",
            "بمبلغ",
            "مبلغ",
            "الرصيد",
            "Purchase",
            "POS"
        )

        return transactionKeywords.any { message.contains(it) }
    }

    override fun detectIsCard(message: String): Boolean {
        return message.contains("البطاقة") ||
                message.contains("بطاقة") ||
                message.contains("البطاقة الائتمانية") ||
                message.contains("بطاقة مدى") ||
                message.contains("POS") ||
                message.contains("نقاط البيع")
    }
}
