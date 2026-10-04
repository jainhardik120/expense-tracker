package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.MandateInfo
import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class SBIBankParser : BaseIndianBankParser() {

    override fun getBankName() = "State Bank of India"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("SBI") ||
                normalizedSender.contains("SBIINB") ||
                normalizedSender.contains("SBIUPI") ||
                normalizedSender.contains("SBICRD") ||
                normalizedSender.contains("ATMSBI") ||
                normalizedSender == "SBIBK" ||
                normalizedSender == "SBIBNK" ||
                normalizedSender.matches(Regex("^[A-Z]{2}-SBIBK-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-SBIBK-[TPG]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-SBIBK$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-SBI$"))
    }

    private fun isCreditCardMessage(sender: String): Boolean {
        return sender.uppercase().contains("SBICRD")
    }

    private fun extractCreditCardLast4(message: String): String? {
        val pattern = Regex("""ending\s+with\s+(\d{4})""", RegexOption.IGNORE_CASE)
        pattern.find(message)?.let { match ->
            return match.groupValues[1]
        }
        return null
    }

    override fun parse(smsBody: String, sender: String, timestamp: Long): ParsedTransaction? {
        val parsed = super.parse(smsBody, sender, timestamp) ?: return null

        if (isCreditCardMessage(sender)) {
            val cardLast4 = extractCreditCardLast4(smsBody) ?: parsed.accountLast4

            val creditLimit = extractAvailableLimit(smsBody) ?: parsed.creditLimit

            val transactionType = when {
                smsBody.contains("payment of", ignoreCase = true) &&
                        smsBody.contains("credited to your SBI Credit Card", ignoreCase = true) -> {
                    TransactionType.INCOME
                }
                smsBody.contains("spent on", ignoreCase = true) -> {
                    TransactionType.CREDIT
                }
                else -> TransactionType.CREDIT
            }

            val merchant = when {
                smsBody.contains("via BBPS", ignoreCase = true) -> "BBPS Payment"
                else -> parsed.merchant
            }

            return parsed.copy(
                accountLast4 = cardLast4,
                type = transactionType,
                merchant = merchant ?: parsed.merchant,
                creditLimit = creditLimit
            )
        }

        return parsed
    }

    override fun extractAvailableLimit(message: String): BigDecimal? {
        val patterns = listOf(
            Regex(
                """available\s+limit\s+is\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """Your\s+available\s+limit\s+is\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            )
        )

        for (pattern in patterns) {
            pattern.find(message)?.let { match ->
                val limitStr = match.groupValues[1].replace(",", "")
                return try {
                    BigDecimal(limitStr)
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }

        return super.extractAvailableLimit(message)
    }

    override fun extractAmount(message: String): BigDecimal? {
        val transactionNumberPattern = Regex(
            """transaction\s+number\s+\d+\s+for\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        transactionNumberPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val paymentPattern =
            Regex("""payment\s+of\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        paymentPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val spentPattern =
            Regex("""Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+spent""", RegexOption.IGNORE_CASE)
        spentPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val upiDebitPattern =
            Regex("""debited\s+by\s+(\d+(?:,\d{3})*(?:\.\d{1,2})?)""", RegexOption.IGNORE_CASE)
        upiDebitPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val upiCreditPattern = Regex(
            """credited\s+by\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)""",
            RegexOption.IGNORE_CASE
        )
        upiCreditPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val debitPattern1 = Regex(
            """Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:has\s+been\s+)?debited""",
            RegexOption.IGNORE_CASE
        )
        debitPattern1.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val debitPattern2 = Regex(
            """INR\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:has\s+been\s+)?debited""",
            RegexOption.IGNORE_CASE
        )
        debitPattern2.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val creditPattern1 = Regex(
            """Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:has\s+been\s+)?credited""",
            RegexOption.IGNORE_CASE
        )
        creditPattern1.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val creditPattern2 = Regex(
            """INR\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:has\s+been\s+)?credited""",
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

        val withdrawPattern =
            Regex("""withdrawn\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        withdrawPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val transferPattern =
            Regex("""transferred\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        transferPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val upiPattern = Regex(
            """paid\s+to\s+[\w.-]+@[\w]+\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        upiPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val atmPattern = Regex(
            """ATM\s+withdrawal\s+of\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        atmPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val yonoCashPattern =
            Regex("""Yono\s+Cash\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        yonoCashPattern.find(message)?.let { match ->
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
            lowerMessage.contains("withdrawn") -> TransactionType.EXPENSE
            lowerMessage.contains("transferred") -> TransactionType.EXPENSE
            lowerMessage.contains("paid to") -> TransactionType.EXPENSE
            lowerMessage.contains("atm withdrawal") -> TransactionType.EXPENSE
            lowerMessage.contains("by sbi debit card") -> TransactionType.EXPENSE

            else -> super.extractTransactionType(message)
        }
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val doneAtPattern =
            Regex("""done\s+at\s+([^.\n]+?)(?:\s+on\s+|$)""", RegexOption.IGNORE_CASE)
        doneAtPattern.find(message)?.let { match ->
            val location = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(location)) {
                return location
            }
        }

        val trfPattern =
            Regex("""trf\s+to\s+([^.\n]+?)(?:\s+Ref|\s+ref|$)""", RegexOption.IGNORE_CASE)
        trfPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val transferFromPattern =
            Regex("""transfer\s+from\s+([^.\n]+?)(?:\s+Ref|\s+ref|$)""", RegexOption.IGNORE_CASE)
        transferFromPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val upiMerchantPattern = Regex("""paid\s+to\s+([\w.-]+)@[\w]+""", RegexOption.IGNORE_CASE)
        upiMerchantPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1])
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val yonoAtmPattern = Regex("""w/d@SBI\s+ATM\s+([A-Z0-9]+)""", RegexOption.IGNORE_CASE)
        yonoAtmPattern.find(message)?.let { match ->
            val atmId = match.groupValues[1]
            return "YONO Cash ATM - $atmId"
        }

        val atmPattern = Regex(
            """ATM\s+(?:withdrawal\s+)?(?:at\s+)?([^.\n]+?)(?:\s+on|\s+Avl)""",
            RegexOption.IGNORE_CASE
        )
        atmPattern.find(message)?.let { match ->
            val location = cleanMerchantName(match.groupValues[1])
            if (isValidMerchantName(location)) {
                return "ATM - $location"
            }
        }

        val neftPattern = Regex(
            """(?:NEFT|IMPS|RTGS)[^:]*:\s*([^.\n]+?)(?:\s+Ref|\s+on|$)""",
            RegexOption.IGNORE_CASE
        )
        neftPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1])
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val debitCardPattern =
            Regex("""by\s+SBI\s+Debit\s+Card\s+([\w\-]+)""", RegexOption.IGNORE_CASE)
        debitCardPattern.find(message)?.let { match ->
            val cardInfo = match.groupValues[1]
            return if (cardInfo.matches(Regex("""\d{4}"""))) {
                cardInfo
            } else {
                val digits = cardInfo.filter { it.isDigit() }
                if (digits.length >= 4) digits.takeLast(4) else cardInfo
            }
        }

        val cardEndingPattern =
            Regex("""card\s+(?:no\.?\s+)?ending\s+[Xx]*(\d{2,4})""", RegexOption.IGNORE_CASE)
        cardEndingPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val pattern1 = Regex("""A/c\s+([X\*]*\d+)""", RegexOption.IGNORE_CASE)
        pattern1.find(message)?.let { match ->
            val accountStr = match.groupValues[1]
            val digitsOnly = accountStr.filter { it.isDigit() }
            return if (digitsOnly.length >= 4) {
                digitsOnly.takeLast(4)
            } else {
                digitsOnly
            }
        }

        val pattern2 = Regex("""A/c\s+ending\s+(\d{4})""", RegexOption.IGNORE_CASE)
        pattern2.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val pattern3 = Regex("""a/c\s+no\.?\s+(?:XX|X\*+)?(\d{4})""", RegexOption.IGNORE_CASE)
        pattern3.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val updatedBalancePattern = Regex(
            """Your\s+updated\s+available\s+balance\s+is\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        updatedBalancePattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val pattern1 =
            Regex("""Avl\s+Bal\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        pattern1.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val pattern2 = Regex(
            """Available\s+Balance:?\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        pattern2.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val pattern3 =
            Regex("""Bal:?\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        pattern3.find(message)?.let { match ->
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
        val transactionNumberPattern =
            Regex("""transaction\s+number\s+([\w\-]+)""", RegexOption.IGNORE_CASE)
        transactionNumberPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val pattern1 = Regex("""Ref\s+No\.?\s*(\w+)""", RegexOption.IGNORE_CASE)
        pattern1.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val pattern2 = Regex("""Txn#\s*(\w+)""", RegexOption.IGNORE_CASE)
        pattern2.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val pattern3 = Regex("""transaction\s+ID:?\s*(\w+)""", RegexOption.IGNORE_CASE)
        pattern3.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("e-statement of sbi credit card")) {
            return false
        }

        if (lowerMessage.contains("is due for")) {
            return false
        }

        if (lowerMessage.contains("sbi card application") ||
            lowerMessage.contains("process your app.no") ||
            lowerMessage.contains("track your application status")
        ) {
            return false
        }

        if (isEMandateNotification(message) || isUPIMandateNotification(message)) {
            return false
        }

        if (lowerMessage.contains("by sbi debit card")) {
            return true
        }

        return super.isTransactionMessage(message)
    }

    fun isUPIMandateNotification(message: String): Boolean {
        val lowerMessage = message.lowercase()
        return lowerMessage.contains("upi-mandate") ||
                lowerMessage.contains("upi mandate") ||
                (lowerMessage.contains("mandate") && lowerMessage.contains("created") && lowerMessage.contains("upi"))
    }

    fun parseUPIMandateSubscription(message: String): UPIMandateInfo? {
        if (!isUPIMandateNotification(message) && !isEMandateNotification(message)) {
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
            Regex("""mandate\s+created\s+for\s+([^.\n]+?)(?:\s+UMN|\s+of|\s*\.|$)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in merchantPatterns) {
            pattern.find(message)?.let { match ->
                val m = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(m)) {
                    merchant = m
                }
            }
            if (merchant != "Unknown Subscription") break
        }

        val datePatterns = listOf(
            Regex("""on\s+(\d{2}-\w{3}-\d{2,4})""", RegexOption.IGNORE_CASE),
            Regex("""date[:\s]+(\d{2}/\d{2}/\d{2,4})""", RegexOption.IGNORE_CASE),
            Regex("""(\d{2}-\d{2}-\d{4})""", RegexOption.IGNORE_CASE)
        )

        var nextDeductionDate: String? = null
        for (pattern in datePatterns) {
            pattern.find(message)?.let { match ->
                nextDeductionDate = match.groupValues[1]
            }
            if (nextDeductionDate != null) break
        }

        val umnPattern = Regex("""UMN[:\s]+([^.\s]+)""", RegexOption.IGNORE_CASE)
        val umn = umnPattern.find(message)?.groupValues?.get(1)

        return UPIMandateInfo(
            amount = amount!!,
            nextDeductionDate = nextDeductionDate,
            merchant = merchant,
            umn = umn
        )
    }

    data class UPIMandateInfo(
        override val amount: BigDecimal,
        override val nextDeductionDate: String?,
        override val merchant: String,
        override val umn: String?
    ) : MandateInfo {
        override val dateFormat = "dd-MMM-yy"
    }
}

