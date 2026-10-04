package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class BankOfBarodaParser : BaseIndianBankParser() {

    override fun getBankName() = "Bank of Baroda"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("BOB") ||
                normalizedSender.contains("BARODA") ||
                normalizedSender.contains("BOBSMS") ||
                normalizedSender.contains("BOBTXN") ||
                normalizedSender.contains("BOBCRD") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-BOBSMS-[A-Z]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-BOBTXN-[A-Z]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-BOB-[A-Z]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-BOBCRD-[A-Z]$")) ||
                normalizedSender == "BOB" ||
                normalizedSender == "BANKOFBARODA"
    }

    override fun extractAmount(message: String): BigDecimal? {
        val alertSpentPattern = Regex(
            """ALERT:\s*INR\s*([\d,]+(?:\.\d{2})?)\s+is\s+spent""",
            RegexOption.IGNORE_CASE
        )
        alertSpentPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val transferPattern = Regex(
            """Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+transferred\s+from""",
            RegexOption.IGNORE_CASE
        )
        transferPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val drPattern = Regex(
            """Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+Dr\.?\s+from""",
            RegexOption.IGNORE_CASE
        )
        drPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val creditPattern = Regex(
            """credited\s+with\s+INR\s+([\d,]+(?:\.\d{2})?)""",
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

        val creditPattern2 = Regex(
            """Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+Credited\s+to""",
            RegexOption.IGNORE_CASE
        )
        creditPattern2.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val crPattern = Regex(
            """Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+.*?Cr\.?\s+to""",
            RegexOption.IGNORE_CASE
        )
        crPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val cashDepositPattern = Regex(
            """Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+deposited\s+in\s+cash""",
            RegexOption.IGNORE_CASE
        )
        cashDepositPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractAmount(message)
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val transferToPattern = Regex(
            """transferred\s+from\s+A/c\s+[^\s]+\s+to:\s*([^.]+?)(?:\.|$)""",
            RegexOption.IGNORE_CASE
        )
        transferToPattern.find(message)?.let { match ->
            val merchantRaw = match.groupValues[1].trim()
            val merchant =
                merchantRaw.split(Regex("""\s+Total\s+Bal""", RegexOption.IGNORE_CASE))[0].trim()
            if (isValidMerchantName(merchant)) {
                return cleanMerchantName(merchant)
            }
        }

        val upiPattern = Regex(
            """Cr\.?\s+to\s+([^\s]+@[^\s.]+)""",
            RegexOption.IGNORE_CASE
        )
        upiPattern.find(message)?.let { match ->
            val vpa = match.groupValues[1]
            val name = vpa.substringBefore("@")
            return if (name == "redacted") {
                "UPI Payment"
            } else {
                cleanMerchantName(name)
            }
        }

        val impsPattern = Regex(
            """IMPS/[\d]+\s+by\s+([^.]+?)(?:\s*\.|$)""",
            RegexOption.IGNORE_CASE
        )
        impsPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        if (message.contains("UPI", ignoreCase = true)) {
            if (message.contains("credited", ignoreCase = true)) {
                return "UPI Credit"
            } else if (message.contains("Dr.", ignoreCase = true)) {
                return "UPI Payment"
            }
        }

        if (message.contains("IMPS", ignoreCase = true)) {
            return "IMPS Transfer"
        }

        if (message.contains("deposited in cash", ignoreCase = true)) {
            return "Cash Deposit"
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val bobCardPattern = Regex(
            """BOBCARD\s+ending\s+(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        bobCardPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val sixDigitPattern = Regex(
            """A/C\s+X*(\d{6})""",
            RegexOption.IGNORE_CASE
        )
        sixDigitPattern.find(message)?.let { match ->
            val digits = match.groupValues[1]
            return digits.takeLast(4)
        }

        val maskedPattern = Regex(
            """A/c\s+\.+(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        maskedPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val avlBalPattern = Regex(
            """AvlBal:\s*Rs\.?\s*([\d,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        avlBalPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val totalBalPattern = Regex(
            """Total\s+Bal:\s*Rs\.?\s*([\d,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        totalBalPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val avlAmtPattern = Regex(
            """Avlbl\s+Amt:\s*Rs\.?\s*([\d,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        avlAmtPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractBalance(message)
    }

    override fun extractReference(message: String): String? {
        val refPattern1 = Regex(
            """Ref:\s*(\d+)""",
            RegexOption.IGNORE_CASE
        )
        refPattern1.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val upiRefPattern = Regex(
            """UPI\s+Ref\s+No\s+(\d+)""",
            RegexOption.IGNORE_CASE
        )
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val impsRefPattern = Regex(
            """IMPS/(\d+)""",
            RegexOption.IGNORE_CASE
        )
        impsRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("spent on your bobcard") -> TransactionType.CREDIT
            lowerMessage.contains("bobcard") && lowerMessage.contains("spent") -> TransactionType.CREDIT
            lowerMessage.contains("bobcard") && lowerMessage.contains("is spent") -> TransactionType.CREDIT

            lowerMessage.contains("transferred from") -> TransactionType.EXPENSE
            lowerMessage.contains("dr.") || lowerMessage.contains("debited") -> TransactionType.EXPENSE

            lowerMessage.contains("cr.") || lowerMessage.contains("credited") -> TransactionType.INCOME
            lowerMessage.contains("deposited") -> TransactionType.INCOME
            else -> super.extractTransactionType(message)
        }
    }

    override fun extractAvailableLimit(message: String): BigDecimal? {
        val creditLimitPattern = Regex(
            """Available\s+credit\s+limit\s+is\s+Rs\.?\s*([\d,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        creditLimitPattern.find(message)?.let { match ->
            val limitStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(limitStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractAvailableLimit(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("dr. from") ||
            lowerMessage.contains("cr. to") ||
            lowerMessage.contains("credited to a/c") ||
            lowerMessage.contains("credited with inr") ||
            lowerMessage.contains("deposited in cash") ||
            lowerMessage.contains("transferred from") ||
            lowerMessage.contains("is spent")
        ) {
            return true
        }

        return super.isTransactionMessage(message)
    }
}