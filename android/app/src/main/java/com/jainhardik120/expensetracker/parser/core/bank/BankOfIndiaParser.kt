package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class BankOfIndiaParser : BaseIndianBankParser() {

    override fun getBankName() = "Bank of India"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()

        val boiSenders = setOf(
            "BOIIND",
            "BOIBNK"
        )

        if (normalizedSender in boiSenders) return true

        return normalizedSender.matches(Regex("^[A-Z]{2}-BOIIND-[ST]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-BOIBNK-[ST]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-BOI-[ST]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-BOIIND$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-BOIBNK$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-BOI$")) ||
                normalizedSender.matches(Regex("^BK-BOIIND.*$")) ||
                normalizedSender.matches(Regex("^JD-BOIIND.*$"))
    }

    override fun extractAmount(message: String): BigDecimal? {
        val rsPattern = Regex(
            """Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:debited|credited)""",
            RegexOption.IGNORE_CASE
        )
        rsPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val inrPattern = Regex(
            """INR\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:debited|credited)""",
            RegexOption.IGNORE_CASE
        )
        inrPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val withdrawnPattern =
            Regex("""withdrawn\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        withdrawnPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractAmount(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("deposited in your account") ||
            lowerMessage.contains("cash") && lowerMessage.contains("deposited")
        ) {
            return TransactionType.INCOME
        }

        if (isInvestmentTransaction(lowerMessage)) {
            return TransactionType.INVESTMENT
        }

        if (lowerMessage.contains("mandate") &&
            (lowerMessage.contains("mutual fund") ||
                    lowerMessage.contains("iccl") ||
                    lowerMessage.contains("groww") ||
                    lowerMessage.contains("zerodha") ||
                    lowerMessage.contains("kuvera") ||
                    lowerMessage.contains("paytm money"))
        ) {
            return TransactionType.INVESTMENT
        }

        if (lowerMessage.contains("debited") && lowerMessage.contains("and credited to")) {
            return TransactionType.EXPENSE
        }

        if (lowerMessage.contains("credited") && lowerMessage.contains("and debited from")) {
            return TransactionType.INCOME
        }

        return super.extractTransactionType(message)
    }

    override fun extractMerchant(message: String, sender: String): String? {
        if (message.contains("Cash Acceptor Machine", ignoreCase = true) ||
            (message.contains("cash", ignoreCase = true) && message.contains(
                "deposited",
                ignoreCase = true
            ))
        ) {
            return "Cash Deposit"
        }

        if (message.contains("Mandate", ignoreCase = true) && message.contains(
                "towards",
                ignoreCase = true
            )
        ) {
            val viaPattern = Regex("""via\s+([A-Za-z0-9]+)""", RegexOption.IGNORE_CASE)
            viaPattern.find(message)?.let { match ->
                val platform = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(platform)) {
                    return platform
                }
            }

            val towardsPattern =
                Regex("""towards\s+([^,\n]+?)(?:\s+for|\s*,|$)""", RegexOption.IGNORE_CASE)
            towardsPattern.find(message)?.let { match ->
                val merchantInfo = match.groupValues[1].trim()
                val cleanedMerchant = merchantInfo
                    .replace(Regex("""\s*-\s*Autopa.*$""", RegexOption.IGNORE_CASE), "")
                    .trim()
                if (isValidMerchantName(cleanedMerchant)) {
                    return cleanMerchantName(cleanedMerchant)
                }
            }
        }

        val creditedToPattern = Regex(
            """credited\s+to\s+([^.\n]+?)(?:\s+via|\s+Ref|\s+on|$)""",
            RegexOption.IGNORE_CASE
        )
        creditedToPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val debitedFromPattern = Regex(
            """debited\s+from\s+([^.\n]+?)(?:\s+via|\s+Ref|\s+on|$)""",
            RegexOption.IGNORE_CASE
        )
        debitedFromPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        if (message.contains("ATM", ignoreCase = true) || message.contains(
                "withdrawn",
                ignoreCase = true
            )
        ) {
            val atmPattern = Regex(
                """(?:ATM|withdrawn)\s+(?:at\s+)?([^.\n]+?)(?:\s+on|\s+Ref|$)""",
                RegexOption.IGNORE_CASE
            )
            atmPattern.find(message)?.let { match ->
                val location = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(location)) {
                    return "ATM - $location"
                }
            }
            return "ATM"
        }

        if (!message.contains("Mandate", ignoreCase = true)) {
            val towardsPattern =
                Regex("""towards\s+([^.\n]+?)(?:\s+via|\s+Ref|\s+on|$)""", RegexOption.IGNORE_CASE)
            towardsPattern.find(message)?.let { match ->
                val merchant = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(merchant)) {
                    return merchant
                }
            }
        }

        val toPattern =
            Regex("""to\s+([^.\n]+?)(?:\s+via|\s+Ref|\s+on|$)""", RegexOption.IGNORE_CASE)
        toPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val fromPattern =
            Regex("""from\s+([^.\n]+?)(?:\s+via|\s+Ref|\s+on|$)""", RegexOption.IGNORE_CASE)
        fromPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val accountPattern = Regex("""A/c\s*(?:XX|X\*+)?(\d{4})""", RegexOption.IGNORE_CASE)
        accountPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val endingPattern = Regex("""(?:Account|A/c)\s+ending\s+(\d{4})""", RegexOption.IGNORE_CASE)
        endingPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val accountNoPattern =
            Regex("""A/c\s+No\.?\s*(?:XX|X\*+)?(\d{4})""", RegexOption.IGNORE_CASE)
        accountNoPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractReference(message: String): String? {
        val refNoPattern = Regex("""Ref\s+No\.?\s*(\d+)""", RegexOption.IGNORE_CASE)
        refNoPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val referencePattern = Regex("""Reference[:\s]+(\w+)""", RegexOption.IGNORE_CASE)
        referencePattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val txnPattern = Regex("""Txn\s*(?:ID|#)[:\s]*(\w+)""", RegexOption.IGNORE_CASE)
        txnPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val upiPattern = Regex("""UPI[:\s]+(\d+)""", RegexOption.IGNORE_CASE)
        upiPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balRsPattern =
            Regex("""Bal[:\s]+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        balRsPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val availableBalPattern = Regex(
            """Available\s+Balance[:\s]+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        availableBalPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val avlBalPattern = Regex(
            """Avl\s+Bal[:\s]+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""",
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

        return super.extractBalance(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("will be")) {
            return false
        }

        if (lowerMessage.contains("call") && lowerMessage.contains("if not done by you")) {
            if (lowerMessage.contains("debited") || lowerMessage.contains("credited") ||
                lowerMessage.contains("withdrawn") || lowerMessage.contains("transferred")
            ) {
                return true
            }
        }

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("one time password") ||
            lowerMessage.contains("verification code")
        ) {
            return false
        }

        if (lowerMessage.contains("offer") ||
            lowerMessage.contains("discount") ||
            lowerMessage.contains("cashback offer") ||
            lowerMessage.contains("win ")
        ) {
            return false
        }

        return super.isTransactionMessage(message)
    }
}
