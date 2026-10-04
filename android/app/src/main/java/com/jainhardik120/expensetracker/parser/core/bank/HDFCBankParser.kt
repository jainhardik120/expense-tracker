package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.CompiledPatterns
import com.jainhardik120.expensetracker.parser.core.MandateInfo
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal
import java.time.LocalDateTime

class HDFCBankParser : BaseIndianBankParser() {

    override fun getBankName() = "HDFC Bank"

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()

        val hdfcSenders = setOf(
            "HDFCBK",
            "HDFCBANK",
            "HDFC",
            "HDFCB"
        )

        if (upperSender in hdfcSenders) return true

        return CompiledPatterns.HDFC.DLT_PATTERNS.any { it.matches(upperSender) }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        if (message.contains("From HDFC Bank Card", ignoreCase = true) &&
            message.contains(" At ", ignoreCase = true) &&
            message.contains(" On ", ignoreCase = true)
        ) {
            val atIndex = message.indexOf(" At ", ignoreCase = true)
            val onIndex = message.indexOf(" On ", ignoreCase = true)
            if (atIndex != -1 && onIndex != -1 && onIndex > atIndex) {
                val merchant = message.substring(atIndex + 4, onIndex).trim()
                if (merchant.isNotEmpty()) {
                    return cleanMerchantName(merchant)
                }
            }
        }

        if (message.contains("withdrawn", ignoreCase = true)) {
            val atLocationPattern = Regex("""At\s+\+?([^O]+?)\s+On""", RegexOption.IGNORE_CASE)
            atLocationPattern.find(message)?.let { match ->
                val location = match.groupValues[1].trim()
                return if (location.isNotEmpty()) {
                    "ATM at ${cleanMerchantName(location)}"
                } else {
                    "ATM"
                }
            }
            return "ATM"
        }

        if (message.contains("ATM", ignoreCase = true)) {
            return "ATM"
        }

        if (message.contains("card", ignoreCase = true) &&
            message.contains(" at ", ignoreCase = true) &&
            (message.contains("block cc", ignoreCase = true) || message.contains(
                "block pcc",
                ignoreCase = true
            ))
        ) {
            val atPattern = Regex(
                """at\s+([^@\s]+(?:@[^\s]+)?(?:\s+[^\s]+)?)(?:\s+by\s+|\s+on\s+|$)""",
                RegexOption.IGNORE_CASE
            )
            atPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                val cleanedMerchant = if (merchant.contains("@")) {
                    val vpaName = merchant.substringBefore("@").trim()
                    when {
                        vpaName.endsWith("qr", ignoreCase = true) -> vpaName.dropLast(2)
                        else -> vpaName
                    }
                } else {
                    merchant
                }
                if (cleanedMerchant.isNotEmpty()) {
                    return cleanMerchantName(cleanedMerchant)
                }
            }
        }

        if (message.contains("SALARY", ignoreCase = true) && message.contains(
                "deposited",
                ignoreCase = true
            )
        ) {
            CompiledPatterns.HDFC.SALARY_PATTERN.find(message)?.let { match ->
                return cleanMerchantName(match.groupValues[1].trim())
            }

            CompiledPatterns.HDFC.SIMPLE_SALARY_PATTERN.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty() && !merchant.all { it.isDigit() }) {
                    return cleanMerchantName(merchant)
                }
            }
        }

        if (message.contains("Info:", ignoreCase = true)) {
            CompiledPatterns.HDFC.INFO_PATTERN.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty() && !merchant.equals("UPI", ignoreCase = true)) {
                    return cleanMerchantName(merchant)
                }
            }
        }

        if (message.contains("VPA", ignoreCase = true)) {
            if (message.contains("from VPA", ignoreCase = true) && message.contains(
                    "credited",
                    ignoreCase = true
                )
            ) {
                val fromVpaPattern = Regex(
                    """from\s+VPA\s*([^@\s]+)@[^\s]+\s*\(UPI\s+\d+\)""",
                    RegexOption.IGNORE_CASE
                )
                fromVpaPattern.find(message)?.let { match ->
                    val vpaUsername = match.groupValues[1].trim()
                    if (vpaUsername.isNotEmpty()) {
                        return cleanMerchantName(vpaUsername)
                    }
                }
            }

            CompiledPatterns.HDFC.VPA_WITH_NAME.find(message)?.let { match ->
                return cleanMerchantName(match.groupValues[1].trim())
            }

            CompiledPatterns.HDFC.VPA_PATTERN.find(message)?.let { match ->
                val vpaName = match.groupValues[1].trim()
                if (vpaName.length > 3 && !vpaName.all { it.isDigit() }) {
                    return cleanMerchantName(vpaName)
                }
            }
        }

        if (message.contains("spent on Card", ignoreCase = true)) {
            CompiledPatterns.HDFC.SPENT_PATTERN.find(message)?.let { match ->
                return cleanMerchantName(match.groupValues[1].trim())
            }
        }

        if (message.contains("debited for", ignoreCase = true)) {
            CompiledPatterns.HDFC.DEBIT_FOR_PATTERN.find(message)?.let { match ->
                return cleanMerchantName(match.groupValues[1].trim())
            }
        }

        if (message.contains("UPI Mandate", ignoreCase = true)) {
            CompiledPatterns.HDFC.MANDATE_PATTERN.find(message)?.let { match ->
                return cleanMerchantName(match.groupValues[1].trim())
            }
        }

        if (message.contains("towards", ignoreCase = true)) {
            val towardsPattern = Regex(
                """towards\s+([^\n]+?)(?:\s+UMRN|\s+ID:|\s+Alert:|$)""",
                RegexOption.IGNORE_CASE
            )
            towardsPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty()) {
                    return cleanMerchantName(merchant)
                }
            }
        }

        if (message.contains("For:", ignoreCase = true)) {
            val forColonPattern =
                Regex("""For:\s+([^\n]+?)(?:\s+From|\s+Via|$)""", RegexOption.IGNORE_CASE)
            forColonPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty()) {
                    return cleanMerchantName(merchant)
                }
            }
        }

        if (message.contains("for ", ignoreCase = true) && message.contains(
                "will be debited",
                ignoreCase = true
            )
        ) {
            val forPattern =
                Regex("""for\s+([^\n]+?)(?:\s+ID:|\s+Act:|$)""", RegexOption.IGNORE_CASE)
            forPattern.find(message)?.let { match ->
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

        if (isInvestmentTransaction(lowerMessage)) {
            return TransactionType.INVESTMENT
        }

        return when {
            lowerMessage.contains("block cc") || lowerMessage.contains("block pcc") -> TransactionType.CREDIT

            lowerMessage.contains("spent on card") && !lowerMessage.contains("block dc") -> TransactionType.CREDIT

            lowerMessage.contains("payment") && lowerMessage.contains("credit card") -> TransactionType.EXPENSE
            lowerMessage.contains("towards") && lowerMessage.contains("credit card") -> TransactionType.EXPENSE

            lowerMessage.contains("sent") && lowerMessage.contains("from hdfc") -> TransactionType.EXPENSE

            lowerMessage.contains("spent") && lowerMessage.contains("from hdfc bank card") -> TransactionType.EXPENSE

            lowerMessage.contains("debited") -> TransactionType.EXPENSE
            lowerMessage.contains("withdrawn") && !lowerMessage.contains("block cc") -> TransactionType.EXPENSE
            lowerMessage.contains("spent") && !lowerMessage.contains("card") -> TransactionType.EXPENSE
            lowerMessage.contains("charged") -> TransactionType.EXPENSE
            lowerMessage.contains("paid") -> TransactionType.EXPENSE
            lowerMessage.contains("purchase") -> TransactionType.EXPENSE

            lowerMessage.contains("credited") -> TransactionType.INCOME
            lowerMessage.contains("deposited") -> TransactionType.INCOME
            lowerMessage.contains("received") -> TransactionType.INCOME
            lowerMessage.contains("refund") -> TransactionType.INCOME
            lowerMessage.contains("cashback") && !lowerMessage.contains("earn cashback") -> TransactionType.INCOME

            else -> null
        }
    }

    override fun extractReference(message: String): String? {
        val hdfcPatterns = listOf(
            CompiledPatterns.HDFC.REF_SIMPLE,
            CompiledPatterns.HDFC.UPI_REF_NO,
            CompiledPatterns.HDFC.REF_NO,
            CompiledPatterns.HDFC.REF_END
        )

        for (pattern in hdfcPatterns) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1].trim()
            }
        }

        return super.extractReference(message)
    }

    override fun extractAccountLast4(message: String): String? {
        val cardPattern = Regex("""Card\s+x(\d{4})""", RegexOption.IGNORE_CASE)
        cardPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val blockDCPattern = Regex("""BLOCK\s+DC\s+(\d{4})""", RegexOption.IGNORE_CASE)
        blockDCPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val hdfcBankPattern = Regex("""HDFC\s+Bank\s+([X\*]*\d+)""", RegexOption.IGNORE_CASE)
        hdfcBankPattern.find(message)?.let { match ->
            val accountStr = match.groupValues[1]
            val digitsOnly = accountStr.filter { it.isDigit() }
            return if (digitsOnly.length >= 4) {
                digitsOnly.takeLast(4)
            } else {
                digitsOnly
            }
        }

        val hdfcPatterns = listOf(
            CompiledPatterns.HDFC.ACCOUNT_DEPOSITED,
            CompiledPatterns.HDFC.ACCOUNT_FROM,
            CompiledPatterns.HDFC.ACCOUNT_SIMPLE,
            CompiledPatterns.HDFC.ACCOUNT_GENERIC
        )

        for (pattern in hdfcPatterns) {
            pattern.find(message)?.let { match ->
                val accountStr = match.groupValues[1]
                return if (accountStr.length >= 4) {
                    accountStr.takeLast(4)
                } else {
                    accountStr
                }
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val avlBalINRPattern =
            Regex("""Avl\s+bal:?\s*INR\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        avlBalINRPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val availableBalINRPattern = Regex(
            """Available\s+Balance:?\s*INR\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        availableBalINRPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val balRsPattern = Regex("""Bal\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        balRsPattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractBalance(message)
    }

    override fun cleanMerchantName(merchant: String): String {
        return super.cleanMerchantName(merchant)
    }

    override fun isTransactionMessage(message: String): Boolean {
        if (isEMandateNotification(message)) {
            return false
        }

        if (isFutureDebitNotification(message)) {
            return false
        }

        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("bill alert") ||
            (lowerMessage.contains("bill") && lowerMessage.contains("is due on"))
        ) {
            return false
        }

        if (lowerMessage.contains("payment alert")) {
            if (!lowerMessage.contains("will be")) {
                return true
            }
        }

        if (lowerMessage.contains("has requested") ||
            lowerMessage.contains("payment request") ||
            lowerMessage.contains("to pay, download") ||
            lowerMessage.contains("collect request") ||
            lowerMessage.contains("ignore if already paid")
        ) {
            return false
        }

        if (lowerMessage.contains("received towards your credit card")) {
            return false
        }

        if (lowerMessage.contains("payment") &&
            lowerMessage.contains("credited to your card")
        ) {
            return false
        }

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("one time password") ||
            lowerMessage.contains("verification code") ||
            lowerMessage.contains("offer") ||
            lowerMessage.contains("discount") ||
            lowerMessage.contains("cashback offer") ||
            lowerMessage.contains("win ")
        ) {
            return false
        }

        val hdfcTransactionKeywords = listOf(
            "debited", "credited", "withdrawn", "deposited",
            "spent", "received", "transferred", "paid",
            "sent",
            "deducted",
            "txn"
        )

        return hdfcTransactionKeywords.any { lowerMessage.contains(it) }
    }

    fun parseEMandateSubscription(message: String): EMandateInfo? {
        if (!isEMandateNotification(message)) {
            return null
        }

        val amountPatterns = listOf(
            Regex("""Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""INR\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        var amount: BigDecimal? = null
        for (pattern in amountPatterns) {
            pattern.find(message)?.let { match ->
                val amountStr = match.groupValues[1].replace(",", "")
                amount = try {
                    BigDecimal(amountStr)
                } catch (e: NumberFormatException) {
                    null
                }
            }
            if (amount != null) break
        }

        if (amount == null) return null

        var merchant = "Unknown Subscription"
        val merchantPatterns = listOf(
            Regex("""towards\s+([^.\n]+?)(?:\s+from|\s+A/c|\s+UMRN|\s+ID:|\s+Alert:|\s*\.|$)""", RegexOption.IGNORE_CASE),
            Regex("""for\s+([^.\n]+?)(?:\s+ID:|\s+Act:|\s*\.|$)""", RegexOption.IGNORE_CASE),
            Regex("""Info:\s*([^.\n]+?)(?:\s*$)""", RegexOption.IGNORE_CASE),
            Regex("""To\s+([^.\n]+?)(?:\s+UPI|,|$)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in merchantPatterns) {
            pattern.find(message)?.let { match ->
                val m = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(m) && m.length > 2) {
                    merchant = m
                }
            }
            if (merchant != "Unknown Subscription") break
        }

        val datePatterns = listOf(
            Regex("""on\s+(\d{2}-\w{3}-\d{2,4})""", RegexOption.IGNORE_CASE),
            Regex("""date[:\s]+(\d{2}/\d{2}/\d{2,4})""", RegexOption.IGNORE_CASE),
            Regex("""(\d{2}-\d{2}-\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""(\d{2}/\d{2}/\d{2,4})""", RegexOption.IGNORE_CASE)
        )

        var nextDeductionDate: String? = null
        for (pattern in datePatterns) {
            pattern.find(message)?.let { match ->
                nextDeductionDate = match.groupValues[1]
            }
            if (nextDeductionDate != null) break
        }

        val umnPatterns = listOf(
            Regex("""UMN[:\s]+([^.\s]+)""", RegexOption.IGNORE_CASE),
            Regex("""UMRN[:\s]+([^.\s]+)""", RegexOption.IGNORE_CASE)
        )
        var umn: String? = null
        for (pattern in umnPatterns) {
            pattern.find(message)?.let { match ->
                umn = match.groupValues[1]
            }
            if (umn != null) break
        }

        return EMandateInfo(
            amount = amount!!,
            nextDeductionDate = nextDeductionDate,
            merchant = merchant,
            umn = umn
        )
    }

    fun parseFutureDebit(message: String): EMandateInfo? {
        if (!isFutureDebitNotification(message)) {
            return null
        }

        val amountPatterns = listOf(
            Regex("""Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""INR\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        var amount: BigDecimal? = null
        for (pattern in amountPatterns) {
            pattern.find(message)?.let { match ->
                val amountStr = match.groupValues[1].replace(",", "")
                amount = try {
                    BigDecimal(amountStr)
                } catch (e: NumberFormatException) {
                    null
                }
            }
            if (amount != null) break
        }

        if (amount == null) return null

        var merchant = "Unknown Subscription"
        val merchantPatterns = listOf(
            Regex("""for\s+([^.\n]+?)(?:\s+ID:|\s+Act:|\s+will\s+be|\s*\.|$)""", RegexOption.IGNORE_CASE),
            Regex("""towards\s+([^.\n]+?)(?:\s+from|\s+A/c|\s+UMRN|\s+ID:|\s*\.|$)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in merchantPatterns) {
            pattern.find(message)?.let { match ->
                val m = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(m) && m.length > 2) {
                    merchant = m
                }
            }
            if (merchant != "Unknown Subscription") break
        }

        val datePatterns = listOf(
            Regex("""on\s+(\d{2}-\w{3}-\d{2,4})""", RegexOption.IGNORE_CASE),
            Regex("""on\s+(\d{2}/\d{2}/\d{2,4})""", RegexOption.IGNORE_CASE),
            Regex("""(\d{2}-\d{2}-\d{4})""", RegexOption.IGNORE_CASE)
        )

        var nextDeductionDate: String? = null
        for (pattern in datePatterns) {
            pattern.find(message)?.let { match ->
                nextDeductionDate = match.groupValues[1]
            }
            if (nextDeductionDate != null) break
        }

        return EMandateInfo(
            amount = amount!!,
            nextDeductionDate = nextDeductionDate,
            merchant = merchant,
            umn = null
        )
    }

    data class EMandateInfo(
        override val amount: BigDecimal,
        override val nextDeductionDate: String?,
        override val merchant: String,
        override val umn: String?
    ) : MandateInfo {
        override val dateFormat = "dd/MM/yy"
    }
}
