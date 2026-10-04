package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.ParsedTransaction
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal
import java.math.RoundingMode
import java.security.MessageDigest

class JKBankParser : BaseIndianBankParser() {

    override fun getBankName() = "JK Bank"

    override fun canHandle(sender: String): Boolean {
        val upperSender = sender.uppercase()

        val jkBankSenders = setOf(
            "JKBANK",
            "JKB",
            "JKBANKL",
            "JKBNK"
        )

        if (upperSender in jkBankSenders) return true

        val dltPatterns = listOf(
            Regex("^[A-Z]{2}-JKBANK.*$"),
            Regex("^[A-Z]{2}-JKB.*$"),
            Regex("^[A-Z]{2}-JKBNK.*$"),
            Regex("^JKBANK-[A-Z]+$"),
            Regex("^JKB-[A-Z]+$")
        )

        return dltPatterns.any { it.matches(upperSender) }
    }

    override fun parse(smsBody: String, sender: String, timestamp: Long): ParsedTransaction? {
        val parsedTransaction = super.parse(smsBody, sender, timestamp) ?: return null

        val customHash = generateJKBankHash(parsedTransaction, smsBody, sender)

        return parsedTransaction.copy(
            transactionHash = customHash
        )
    }

    private fun generateJKBankHash(
        transaction: ParsedTransaction,
        smsBody: String,
        sender: String
    ): String {
        val normalizedAmount = transaction.amount.setScale(2, RoundingMode.HALF_UP)

        val reference = transaction.reference
        val transactionTime = extractTransactionTime(smsBody)

        val hashData = when {
            reference != null && transactionTime != null -> {
                "JKBANK|${normalizedAmount}|REF:${reference}|TIME:${transactionTime}"
            }

            reference != null -> {
                "JKBANK|${normalizedAmount}|REF:${reference}"
            }

            transactionTime != null && transaction.balance != null -> {
                val normalizedBalance = transaction.balance.setScale(2, RoundingMode.HALF_UP)
                "JKBANK|${normalizedAmount}|TIME:${transactionTime}|BAL:${normalizedBalance}"
            }

            transactionTime != null -> {
                "JKBANK|${normalizedAmount}|TIME:${transactionTime}"
            }

            transaction.balance != null -> {
                val normalizedBalance = transaction.balance.setScale(2, RoundingMode.HALF_UP)
                "JKBANK|${normalizedAmount}|${sender}|BAL:${normalizedBalance}"
            }

            else -> {
                "${sender}|${normalizedAmount}|${transaction.timestamp}"
            }
        }

        return MessageDigest.getInstance("MD5")
            .digest(hashData.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }

    private fun extractJKBankReference(message: String): String? {
        val patterns = listOf(
            Regex("""RTGS-([A-Z0-9]+)"""),
            Regex("""NEFT-([A-Z0-9]+)"""),
            Regex("""IMPS-([A-Z0-9]+)"""),
            Regex("""UTR\s+([A-Z0-9]+)"""),
            Regex("""TRN\s+([A-Z0-9]+)"""),
            Regex("""by\s+(CHRGS/[^.]+)"""),
            Regex("""by\s+(eTFR/[^.]+)"""),
            Regex("""by\s+(mTFR/\d+/[^.]+)"""),
            Regex("""UPI\s+Ref[:\s]+(\d+)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in patterns) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1].trim()
            }
        }

        return null
    }

    private fun extractTransactionTime(message: String): String? {
        val patterns = listOf(
            Regex("""at\s+(\d{1,2}:\d{2}(?::\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex(
                """on\s+(\d{1,2}-\w{3}-\d{2,4})\s+at\s+(\d{1,2}:\d{2})""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""on\s+(\d{1,2}-\w{3}-\d{2,4})""", RegexOption.IGNORE_CASE)
        )

        for (pattern in patterns) {
            pattern.find(message)?.let { match ->
                return when (match.groupValues.size) {
                    2 -> match.groupValues[1]
                    3 -> "${match.groupValues[1]} ${match.groupValues[2]}"
                    else -> null
                }
            }
        }

        return null
    }

    override fun extractMerchant(message: String, sender: String): String? {
        if (message.contains("IMPS Fund transfer", ignoreCase = true)) {
            val impsPattern = Regex(
                """Amt\s+received\s+from\s+([^h]+?)(?:\s+having\s+A/C|$)""",
                RegexOption.IGNORE_CASE
            )
            impsPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty()) {
                    return cleanMerchantName(merchant)
                }
            }

            val fromPattern = Regex(
                """received\s+from\s+([^.\n]+?)(?:\s+having|\s+with|$)""",
                RegexOption.IGNORE_CASE
            )
            fromPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (merchant.isNotEmpty()) {
                    return cleanMerchantName(merchant)
                }
            }

            return "IMPS Transfer"
        }

        if (message.contains("TIN/Tax Information", ignoreCase = true) ||
            message.contains("TIN/Tax Informat", ignoreCase = true)
        ) {
            return "Tax Information Network"
        }

        if (message.contains("ATM RECOVERY", ignoreCase = true)) {
            return "ATM Recovery Charge"
        }

        val towardsPattern = Regex(
            """towards\s+([^.\n]+?)(?:\.\s*Avl|\.\s*Available|\.\s*To\s+dispute|$)""",
            RegexOption.IGNORE_CASE
        )
        towardsPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()

            if (merchant.contains("TIN/Tax Informat", ignoreCase = true) ||
                merchant.contains("TIN/Tax Information", ignoreCase = true)
            ) {
                return "Tax Information Network"
            }

            return cleanMerchantName(merchant)
        }

        val transactionByPattern = Regex(
            """(?:Debited|Credited)\s+by\s+INR\s+[\d,]+(?:\.\d{2})?\s+at\s+[\d:]+\s+by\s+([^.\n]+?)(?:\.|Available|$)""",
            RegexOption.IGNORE_CASE
        )
        transactionByPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()

            return when {
                merchant.contains("CHRGS", ignoreCase = true) ||
                        merchant.contains("CHARGES", ignoreCase = true) -> null
                merchant.contains(
                    "INDIAN CLEARING CORPO",
                    ignoreCase = true
                ) -> "Indian Clearing Corporation"

                merchant.contains("CLEARING CORPO", ignoreCase = true) -> "Clearing Corporation"
                merchant.contains("NSE CLEARING", ignoreCase = true) -> "NSE Clearing"
                merchant.contains("BSE CLEARING", ignoreCase = true) -> "BSE Clearing"
                merchant.contains("RTGS", ignoreCase = true) && !merchant.contains(
                    "CLEARING",
                    ignoreCase = true
                ) -> "RTGS Transfer"

                merchant.contains("NEFT", ignoreCase = true) -> "NEFT Transfer"
                merchant.contains("IMPS", ignoreCase = true) -> "IMPS Transfer"
                merchant.contains("eTFR", ignoreCase = true) -> "Transfer"
                merchant.contains("mTFR", ignoreCase = true) -> {
                    val mtfrMatch =
                        Regex("""mTFR/\d+/(.+)""", RegexOption.IGNORE_CASE).find(merchant)
                    mtfrMatch?.let {
                        cleanMerchantName(it.groupValues[1].trim())
                    } ?: "Mobile Transfer"
                }

                merchant.contains("TIN", ignoreCase = true) -> "Tax Information Network"
                else -> cleanMerchantName(merchant.substringBefore("/"))
            }
        }

        val simpleByPattern =
            Regex("""by\s+([^.\n]+?)(?:\.|Available|$)""", RegexOption.IGNORE_CASE)
        simpleByPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            if (!merchant.startsWith("INR", ignoreCase = true)) {
                return cleanMerchantName(merchant)
            }
        }

        if (message.contains("via UPI from", ignoreCase = true)) {
            val fromPattern =
                Regex("""via\s+UPI\s+from\s+([^.\n]+?)\s+on""", RegexOption.IGNORE_CASE)
            fromPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (isValidMerchantName(merchant)) {
                    return cleanMerchantName(merchant)
                }
            }
        }

        val mtfrPattern = Regex("""mTFR/\d+/([^.\n]+?)(?:\.|A/C|$)""", RegexOption.IGNORE_CASE)
        mtfrPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            if (isValidMerchantName(merchant)) {
                return cleanMerchantName(merchant)
            }
        }

        if (message.contains("via UPI", ignoreCase = true)) {
            val vpaPattern = Regex("""to\s+([^@\s]+@[^\s]+)""", RegexOption.IGNORE_CASE)
            vpaPattern.find(message)?.let { match ->
                val vpa = match.groupValues[1].trim()
                val merchantName = vpa.substringBefore("@")
                if (merchantName.isNotEmpty() && merchantName != "upi") {
                    return cleanMerchantName(merchantName)
                }
            }

            val toMerchantPattern =
                Regex("""to\s+([^.\n]+?)\s+via\s+UPI""", RegexOption.IGNORE_CASE)
            toMerchantPattern.find(message)?.let { match ->
                val merchant = match.groupValues[1].trim()
                if (isValidMerchantName(merchant)) {
                    return cleanMerchantName(merchant)
                }
            }

            return "UPI"
        }

        if (message.contains("ATM", ignoreCase = true) ||
            message.contains("withdrawn", ignoreCase = true)
        ) {
            return "ATM"
        }

        val merchantPatterns = listOf(
            Regex("""to\s+([^.\n]+?)\s+via""", RegexOption.IGNORE_CASE),
            Regex("""from\s+([^.\n]+?)(?:\s+on|\s+Ref|$)""", RegexOption.IGNORE_CASE),
            Regex("""at\s+([^.\n]+?)(?:\s+on|\s+Ref|$)""", RegexOption.IGNORE_CASE),
            Regex("""for\s+([^.\n]+?)(?:\s+on|\s+Ref|$)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in merchantPatterns) {
            pattern.find(message)?.let { match ->
                val merchant = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(merchant)) {
                    return merchant
                }
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("clearing corpo") ||
            lowerMessage.contains("indian clearing") ||
            lowerMessage.contains("nse clearing") ||
            lowerMessage.contains("bse clearing") ||
            lowerMessage.contains("iccl") ||
            lowerMessage.contains("nsccl")
        ) {
            return when {
                lowerMessage.contains("credited") -> TransactionType.INVESTMENT
                lowerMessage.contains("debited") -> TransactionType.INVESTMENT
                else -> null
            }
        }

        return when {
            lowerMessage.contains("has been debited") -> TransactionType.EXPENSE
            lowerMessage.contains("has been credited") -> TransactionType.INCOME

            lowerMessage.contains("debited") -> TransactionType.EXPENSE
            lowerMessage.contains("withdrawn") -> TransactionType.EXPENSE
            lowerMessage.contains("spent") -> TransactionType.EXPENSE
            lowerMessage.contains("charged") -> TransactionType.EXPENSE
            lowerMessage.contains("paid") -> TransactionType.EXPENSE
            lowerMessage.contains("purchase") -> TransactionType.EXPENSE
            lowerMessage.contains("transferred") -> TransactionType.EXPENSE

            lowerMessage.contains("credited") -> TransactionType.INCOME
            lowerMessage.contains("deposited") -> TransactionType.INCOME
            lowerMessage.contains("received") -> TransactionType.INCOME
            lowerMessage.contains("refund") -> TransactionType.INCOME
            lowerMessage.contains("cashback") && !lowerMessage.contains("earn cashback") -> TransactionType.INCOME

            else -> null
        }
    }

    override fun extractReference(message: String): String? {
        val jkBankPatterns = listOf(
            Regex("""RRN\s+No\.?\s*(\d+)""", RegexOption.IGNORE_CASE),
            Regex("""UPI\s+Ref[:\s]+(\d+)""", RegexOption.IGNORE_CASE),
            Regex("""txn\s+Ref[:\s]+([A-Z0-9]+)""", RegexOption.IGNORE_CASE),
            Regex("""Reference[:\s]+([A-Z0-9]+)""", RegexOption.IGNORE_CASE),
            Regex("""Ref\s+No[:\s]+([A-Z0-9]+)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in jkBankPatterns) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1].trim()
            }
        }

        return super.extractReference(message)
    }

    override fun extractAccountLast4(message: String): String? {
        val jkBankPatterns = listOf(
            Regex("""Your\s+A\/c\s+[X]+(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""JK\s+Bank\s+A\/c\s+no\.\s+[X]+(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""A\/c\s+X{3}(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""A\/c\s+[X]*(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""Account\s+[X]+(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""A\/c\s+ending\s+(\d{4})""", RegexOption.IGNORE_CASE)
        )

        for (pattern in jkBankPatterns) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1]
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balancePatterns = listOf(
            Regex(
                """Available\s+Bal\s+is\s+INR\s*([0-9,]+(?:\.\d{2})?)\s*(?:Cr|Dr)?""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """A/C\s+Bal\s+is\s+INR\s*([0-9,]+(?:\.\d{2})?)\s*(?:Cr|Dr)?""",
                RegexOption.IGNORE_CASE
            ),
            Regex("""Avl\s+Bal[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""Balance[:\s]+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE),
            Regex("""Bal\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in balancePatterns) {
            pattern.find(message)?.let { match ->
                val balanceStr = match.groupValues[1].replace(",", "")
                return try {
                    BigDecimal(balanceStr)
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }

        return super.extractBalance(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

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

        if (lowerMessage.contains("has requested") ||
            lowerMessage.contains("payment request") ||
            lowerMessage.contains("collect request") ||
            lowerMessage.contains("requesting payment")
        ) {
            return false
        }

        if (lowerMessage.contains("your rtgs txn") && lowerMessage.contains("has been credited")) {
            return false
        }
        if (lowerMessage.contains("your neft txn") && lowerMessage.contains("has been credited")) {
            return false
        }
        if (lowerMessage.contains("your imps txn") && lowerMessage.contains("has been credited")) {
            return false
        }

        if (lowerMessage.contains("if not done by you") ||
            lowerMessage.contains("report immediately")
        ) {
            val transactionKeywords = listOf(
                "debited", "credited", "withdrawn", "deposited",
                "spent", "received", "transferred", "paid"
            )
            return transactionKeywords.any { lowerMessage.contains(it) }
        }

        val jkBankTransactionKeywords = listOf(
            "has been debited",
            "has been credited",
            "debited",
            "credited",
            "withdrawn",
            "deposited",
            "spent",
            "received",
            "transferred",
            "paid"
        )

        return jkBankTransactionKeywords.any { lowerMessage.contains(it) }
    }
}
