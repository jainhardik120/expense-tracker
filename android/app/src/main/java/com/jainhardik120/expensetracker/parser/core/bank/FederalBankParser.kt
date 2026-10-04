package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.MandateInfo
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class FederalBankParser : BaseIndianBankParser() {

    override fun getBankName() = "Federal Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("FEDBNK") ||
                normalizedSender.contains("FEDERAL") ||
                normalizedSender.contains("FEDFIB") ||
                normalizedSender.contains("FEDSCP") ||
                normalizedSender.matches(Regex("^[A-Z]{2}-FEDBNK-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-FEDSCP-S$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-FedFiB-[A-Z]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-FEDBNK-[TPG]$")) ||
                normalizedSender.matches(Regex("^[A-Z]{2}-FEDBNK$"))
    }

    fun detectIsCreditCard(message: String): Boolean {
        return message.lowercase().contains("credit card")
    }

    override fun detectIsCard(message: String): Boolean {
        val lowerMessage = message.lowercase()

        return when {
            detectIsCreditCard(message) -> true

            lowerMessage.contains("debit card") -> true

            lowerMessage.contains("card xx**") -> true
            lowerMessage.contains("card ending with") -> true

            lowerMessage.matches(Regex(""".*inr\s+[\d,]+(?:\.\d{2})?\s+spent.*""")) -> true

            lowerMessage.contains(" spent ") && lowerMessage.contains(" at ") &&
                    lowerMessage.contains(" on ") -> true

            (lowerMessage.contains("e-mandate") || lowerMessage.contains("payment of")) &&
                    (lowerMessage.contains("federal bank debit card") ||
                            lowerMessage.contains("federal bank credit card")) -> true

            lowerMessage.contains("via upi") -> false
            lowerMessage.contains("to vpa") -> false

            lowerMessage.contains("atm") -> false
            lowerMessage.contains("withdrawn") && !lowerMessage.contains("card") -> false

            lowerMessage.contains("via imps") -> false
            lowerMessage.contains("via neft") -> false
            lowerMessage.contains("via rtgs") -> false

            else -> false
        }
    }

    override fun extractAmount(message: String): BigDecimal? {
        val rupeeSymbolPattern = Regex(
            """₹\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        rupeeSymbolPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val inrSpentPattern = Regex(
            """INR\s+([0-9,]+(?:\.\d{2})?)\s+spent""",
            RegexOption.IGNORE_CASE
        )
        inrSpentPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val receivedPattern = Regex(
            """you've received INR\s+([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        receivedPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val debitPattern = Regex(
            """Rs\s+([0-9,]+(?:\.\d{2})?)\s+debited""",
            RegexOption.IGNORE_CASE
        )
        debitPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val sentPattern = Regex(
            """Rs\s+([0-9,]+(?:\.\d{2})?)\s+sent""",
            RegexOption.IGNORE_CASE
        )
        sentPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val creditPattern = Regex(
            """Rs\s+([0-9,]+(?:\.\d{2})?)\s+credited""",
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

        val hasReceivedPattern = Regex(
            """has\s+received\s+Rs\s+([0-9,]+(?:\.\d{2})?)\s+from""",
            RegexOption.IGNORE_CASE
        )
        hasReceivedPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val withdrawnPattern = Regex(
            """withdrawn\s+Rs\s+([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        withdrawnPattern.find(message)?.let { match ->
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
        val hasReceivedPattern = Regex(
            """^([A-Z][A-Za-z0-9\s]+?)\s+has\s+received\s+Rs""",
            RegexOption.IGNORE_CASE
        )
        hasReceivedPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        if (message.contains("credited to your A/c", ignoreCase = true) &&
            message.contains("via IMPS", ignoreCase = true)
        ) {
            return "IMPS Credit"
        }

        if (detectIsCard(message)) {
            if (message.contains(" at ", ignoreCase = true)) {
                val scapiaPattern = Regex(
                    """at\s+([^.\n]+?)\s+on\s+your""",
                    RegexOption.IGNORE_CASE
                )
                scapiaPattern.find(message)?.let { match ->
                    val merchant = cleanMerchantName(match.groupValues[1].trim())
                    if (isValidMerchantName(merchant)) {
                        val cleanedMerchant = merchant
                            .replace(
                                Regex(
                                    """\s+(limited|ltd|pvt\s+ltd|private\s+limited)$""",
                                    RegexOption.IGNORE_CASE
                                ), ""
                            )
                            .trim()
                        return cleanedMerchant.ifEmpty { merchant }
                    }
                }

                val creditCardPattern = Regex(
                    """at\s+([^.\n]+?)\s+on\s+\d""",
                    RegexOption.IGNORE_CASE
                )
                creditCardPattern.find(message)?.let { match ->
                    val merchant = cleanMerchantName(match.groupValues[1].trim())
                    if (isValidMerchantName(merchant)) {
                        val cleanedMerchant = merchant
                            .replace(
                                Regex(
                                    """\s+(limited|ltd|pvt\s+ltd|private\s+limited)$""",
                                    RegexOption.IGNORE_CASE
                                ), ""
                            )
                            .trim()
                        return cleanedMerchant.ifEmpty { merchant }
                    }
                }
            }
        }

        if (message.contains("e-mandate", ignoreCase = true) || message.contains(
                "payment of",
                ignoreCase = true
            )
        ) {
            val emandatePattern = Regex(
                """payment of\s+[^.]+?\s+for\s+([^.\n]+?)\s+via\s+e-mandate""",
                RegexOption.IGNORE_CASE
            )
            emandatePattern.find(message)?.let { match ->
                val merchant = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(merchant)) {
                    return merchant
                }
            }

            val emandateDeclinedPattern = Regex(
                """payment via e-mandate\s+declined\s+for\s+ID:\s*[^.]+?\s+on\s+Federal Bank\s+Debit Card\s+\d+""",
                RegexOption.IGNORE_CASE
            )
            if (emandateDeclinedPattern.find(message) != null) {
                return "E-Mandate Declined"
            }
        }

        if (message.contains("VPA", ignoreCase = true)) {
            val vpaPattern = Regex(
                """to\s+VPA\s+([^\s]+?)(?:\.\s*Ref\s+No|\s*Ref\s+No|$)""",
                RegexOption.IGNORE_CASE
            )
            vpaPattern.find(message)?.let { match ->
                val vpa = match.groupValues[1].trim()
                return parseUPIMerchant(vpa)
            }
        }

        val toPattern = Regex(
            """to\s+([^.\n]+?)(?:\.\s*Ref|Ref\s+No|$)""",
            RegexOption.IGNORE_CASE
        )
        toPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim()
            if (!merchant.contains("VPA", ignoreCase = true)) {
                val cleaned = cleanMerchantName(merchant)
                if (isValidMerchantName(cleaned)) {
                    return cleaned
                }
            }
        }

        if (message.contains("you've received", ignoreCase = true)) {
            val sentByPattern = Regex(
                """It was sent by\s+([^.\n]+?)(?:\s+on|$)""",
                RegexOption.IGNORE_CASE
            )
            sentByPattern.find(message)?.let { match ->
                val sender = match.groupValues[1].trim()
                if (sender.matches(Regex("^0+$")) || sender.length <= 4) {
                    return "Bank Transfer"
                }
                val merchant = cleanMerchantName(sender)
                if (isValidMerchantName(merchant)) {
                    return merchant
                }
            }
        }

        val fromPattern = Regex(
            """from\s+([^.\n]+?)(?:\.\s*|$)""",
            RegexOption.IGNORE_CASE
        )
        fromPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        if (message.contains("ATM", ignoreCase = true) ||
            message.contains("withdrawn", ignoreCase = true)
        ) {
            return "ATM Withdrawal"
        }

        return super.extractMerchant(message, sender)
    }

    private fun parseUPIMerchant(vpa: String): String {
        val cleanVPA = vpa.split("@")[0].lowercase()

        return when {
            cleanVPA.contains("indigo") -> "Indigo"
            cleanVPA.contains("spicejet") -> "SpiceJet"
            cleanVPA.contains("airasia") -> "AirAsia"
            cleanVPA.contains("vistara") -> "Vistara"
            cleanVPA.contains("airindia") -> "Air India"

            cleanVPA.contains("uber") -> "Uber"
            cleanVPA.contains("ola") -> "Ola"
            cleanVPA.contains("rapido") -> "Rapido"

            cleanVPA.contains("amazon") -> "Amazon"
            cleanVPA.contains("flipkart") -> "Flipkart"
            cleanVPA.contains("myntra") -> "Myntra"
            cleanVPA.contains("meesho") -> "Meesho"

            cleanVPA.contains("paytm") -> "Paytm"
            cleanVPA.contains("bharatpe") -> "BharatPe"
            cleanVPA.contains("phonepe") -> "PhonePe"
            cleanVPA.contains("googlepay") || cleanVPA.contains("gpay") -> "Google Pay"

            cleanVPA.contains("swiggy") -> "Swiggy"
            cleanVPA.contains("zomato") -> "Zomato"

            cleanVPA.contains("netflix") -> "Netflix"
            cleanVPA.contains("spotify") -> "Spotify"
            cleanVPA.contains("hotstar") || cleanVPA.contains("disney") -> "Disney+ Hotstar"
            cleanVPA.contains("prime") -> "Amazon Prime"
            cleanVPA.contains("pvr") || cleanVPA.contains("inox") -> "PVR Inox"
            cleanVPA.contains("bookmyshow") || cleanVPA.contains("bms") -> "BookMyShow"

            cleanVPA.contains("jio") -> "Jio"
            cleanVPA.contains("airtel") -> "Airtel"
            cleanVPA.contains("vodafone") || cleanVPA.contains("vi") -> "Vi"
            cleanVPA.contains("bsnl") -> "BSNL"

            cleanVPA.contains("irctc") -> "IRCTC"
            cleanVPA.contains("redbus") -> "RedBus"
            cleanVPA.contains("makemytrip") || cleanVPA.contains("mmt") -> "MakeMyTrip"
            cleanVPA.contains("goibibo") -> "Goibibo"
            cleanVPA.contains("oyo") -> "OYO"
            cleanVPA.contains("airbnb") -> "Airbnb"

            cleanVPA.contains("razorpay") || cleanVPA.contains("razorp") || cleanVPA.contains("rzp") -> {
                when {
                    cleanVPA.contains("pvr") -> "PVR"
                    cleanVPA.contains("inox") -> "PVR Inox"
                    cleanVPA.contains("swiggy") -> "Swiggy"
                    cleanVPA.contains("zomato") -> "Zomato"
                    else -> "Online Payment"
                }
            }

            cleanVPA.contains("payu") || cleanVPA.contains("billdesk") || cleanVPA.contains("ccavenue") -> "Online Payment"

            cleanVPA.matches(Regex("\\d+")) -> "Individual"

            else -> vpa.trim()
        }
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("otp") ||
            lowerMessage.contains("one time password") ||
            lowerMessage.contains("verification code")
        ) {
            return false
        }

        if (isMandateCreationNotification(message) || isDeclinedMandatePayment(message)) {
            return false
        }

        val federalKeywords = listOf(
            "sent via upi",
            "debited via upi",
            "credited",
            "withdrawn",
            "received",
            "transferred",
            "spent on your credit card",
            "credit card was successful",
            "payment of",
            "payment via e-mandate"
        )

        if (federalKeywords.any { lowerMessage.contains(it) }) {
            return true
        }

        return super.isTransactionMessage(message)
    }

    override fun extractAccountLast4(message: String): String? {
        if (detectIsCard(message)) {
            val endingWithPattern = Regex(
                """(?:credit|debit)\s+card\s+ending\s+with\s+(\d{4})""",
                RegexOption.IGNORE_CASE
            )
            endingWithPattern.find(message)?.let { match ->
                return match.groupValues[1]
            }

            val cardPattern = Regex(
                """card\s+XX\*\*?(\d{4})""",
                RegexOption.IGNORE_CASE
            )
            cardPattern.find(message)?.let { match ->
                return match.groupValues[1]
            }
        }

        return super.extractAccountLast4(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        return super.extractBalance(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            isOutgoingHasReceivedPattern(message) -> {
                if (isInvestmentTransaction(lowerMessage)) {
                    TransactionType.INVESTMENT
                } else {
                    TransactionType.EXPENSE
                }
            }

            lowerMessage.contains("received your payment") &&
                lowerMessage.contains("credit card") -> TransactionType.TRANSFER

            detectIsCreditCard(message) && (lowerMessage.contains("spent") ||
                lowerMessage.contains("was successful") ||
                lowerMessage.contains("txn of")) -> TransactionType.CREDIT

            (lowerMessage.contains("e-mandate") || lowerMessage.contains("payment of")) &&
                    lowerMessage.contains("processed successfully") -> TransactionType.EXPENSE

            lowerMessage.contains("sent via upi") -> TransactionType.EXPENSE
            lowerMessage.contains("debited") -> TransactionType.EXPENSE
            lowerMessage.contains("withdrawn") -> TransactionType.EXPENSE
            lowerMessage.contains("spent") && !detectIsCreditCard(message) -> TransactionType.EXPENSE
            lowerMessage.contains("paid") -> TransactionType.EXPENSE

            lowerMessage.contains("credited") -> TransactionType.INCOME
            lowerMessage.contains("received") -> TransactionType.INCOME
            lowerMessage.contains("deposited") -> TransactionType.INCOME
            lowerMessage.contains("refund") -> TransactionType.INCOME

            else -> super.extractTransactionType(message)
        }
    }

    private fun isOutgoingHasReceivedPattern(message: String): Boolean {
        val pattern = Regex(
            """has\s+received\s+Rs\s+[\d,.]+\s+from\s+your\s+A/c""",
            RegexOption.IGNORE_CASE
        )
        return pattern.containsMatchIn(message)
    }

    fun isMandateCreationNotification(message: String): Boolean {
        val lowerMessage = message.lowercase()

        return (lowerMessage.contains("mandate") || lowerMessage.contains("e-mandate")) &&
                (lowerMessage.contains("successfully created a mandate") ||
                        lowerMessage.contains("you have successfully created") ||
                        lowerMessage.contains("successfully created") ||
                        lowerMessage.contains("has been initiated") ||
                        lowerMessage.contains("registration has been initiated"))
    }

    fun isDeclinedMandatePayment(message: String): Boolean {
        val lowerMessage = message.lowercase()

        return (lowerMessage.contains("e-mandate") || lowerMessage.contains("payment of")) &&
                lowerMessage.contains("declined")
    }

    fun parseEMandateSubscription(message: String): EMandateInfo? {
        if (!isMandateCreationNotification(message)) {
            return null
        }

        val amountPattern = Regex(
            """(?:for\s+a\s+)?maximum\s+amount\s+of\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        val amount = amountPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        } ?: return null

        val datePattern =
            Regex("""starting\s+from\s+(\d{2}-\d{2}-\d{4})""", RegexOption.IGNORE_CASE)
        val startDate = datePattern.find(message)?.groupValues?.get(1)

        val merchantPattern = Regex(
            """(?:created\s+a\s+mandate\s+on|mandate\s+on)\s+([^.\n]+?)(?:\s+for|\s*$)""",
            RegexOption.IGNORE_CASE
        )
        val merchant = merchantPattern.find(message)?.let { match ->
            cleanMerchantName(match.groupValues[1].trim())
        } ?: "Unknown Subscription"

        val umnPattern = Regex("""Mandate\s+Ref\s+No-?\s*([^.\s]+)""", RegexOption.IGNORE_CASE)
        val umn = umnPattern.find(message)?.groupValues?.get(1)

        return EMandateInfo(
            amount = amount,
            nextDeductionDate = startDate,
            merchant = merchant,
            umn = umn
        )
    }

    fun parseFutureDebit(message: String): EMandateInfo? {
        val lowerMessage = message.lowercase()

        if (!lowerMessage.contains("payment due") || !lowerMessage.contains("will be processed")) {
            return null
        }

        val amountPattern = Regex("""INR\s+(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        val amount = amountPattern.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        } ?: return null

        val datePattern = Regex("""on\s+(\d{2}/\d{2}/\d{4})""", RegexOption.IGNORE_CASE)
        val dueDate = datePattern.find(message)?.groupValues?.get(1)?.let { dateStr ->
            try {
                val parts = dateStr.split("/")
                if (parts.size == 3) {
                    "${parts[0]}/${parts[1]}/${parts[2].takeLast(2)}"
                } else {
                    dateStr
                }
            } catch (e: Exception) {
                dateStr
            }
        }

        val merchantPattern = Regex("""for\s+([^.\n]+?)\s*,\s*INR""", RegexOption.IGNORE_CASE)
        val merchant = merchantPattern.find(message)?.let { match ->
            cleanMerchantName(match.groupValues[1].trim())
        } ?: "Unknown Subscription"

        return EMandateInfo(
            amount = amount,
            nextDeductionDate = dueDate,
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
        override val dateFormat = "dd-MM-yyyy"
    }

    fun isTransactionMessageForTesting(message: String): Boolean = isTransactionMessage(message)
}