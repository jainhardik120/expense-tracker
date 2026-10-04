package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType

class KotakBankParser : BankParser() {

    override fun getBankName() = "Kotak Bank"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()

        return normalizedSender.matches(Regex("^[A-Z]{2}-KOTAKB-[ST]$"))
    }

    override fun extractMerchant(message: String, sender: String): String? {

        val toPattern = Regex("to\\s+([^\\s]+@[^\\s]+)\\s+on", RegexOption.IGNORE_CASE)
        val fromPattern = Regex("from\\s+([^\\s]+@[^\\s]+)\\s+on", RegexOption.IGNORE_CASE)

        val upiMatch = toPattern.find(message) ?: fromPattern.find(message)

        upiMatch?.let { match ->
            val upiId = match.groupValues[1].trim()

            val merchantName = when {
                upiId.startsWith("upi", ignoreCase = true) -> {
                    val name = upiId.substring(3).substringBefore("@")
                    if (name.isNotEmpty()) cleanMerchantName(name) else null
                }
                else -> {
                    val name = upiId.substringBefore("@")
                    val bankCode = upiId.substringAfter("@")

                    when {
                        isPaymentAppGeneratedId(name) -> {
                            extractMerchantFromBankCode(bankCode) ?: cleanMerchantName(name)
                        }
                        name.isNotEmpty() && (!name.all { it.isDigit() } || name.contains("-") || name.contains(
                            "_"
                        )) -> {
                            if (name.all { it.isDigit() || it == '-' || it == '_' }) {
                                extractMerchantFromBankCode(bankCode) ?: name
                            } else {
                                cleanMerchantName(name)
                            }
                        }
                        name.length > 0 && name.all { it.isDigit() } -> {
                            name
                        }

                        else -> null
                    }
                }
            }

            if (merchantName != null) {
                if (isValidMerchantName(merchantName)) {
                    return merchantName
                }
                return merchantName
            }
        }

        return super.extractMerchant(message, sender)
    }

    private fun isPaymentAppGeneratedId(name: String): Boolean {
        val lowerName = name.lowercase()

        val generatedIdPrefixes = listOf(
            "paytmqr",
            "phonepeqr",
            "phonepe.qr",
            "gpay",
            "amazonpayqr",
            "bhimqr",
            "bharatpeqr",
            "freechargeqr",
            "mobikwikqr"
        )

        if (generatedIdPrefixes.any { lowerName.startsWith(it) }) {
            return true
        }

        if (name.length > 20 && name.any { it.isLetter() } && name.any { it.isDigit() }) {
            return true
        }

        return false
    }

    private fun extractMerchantFromBankCode(bankCode: String): String? {
        return when (bankCode.lowercase()) {
            "okaxis" -> "Axis Bank"
            "okbizaxis" -> "Axis Bank Business"
            "okhdfcbank" -> "HDFC Bank"
            "okicici" -> "ICICI Bank"
            "oksbi" -> "State Bank of India"
            "paytm" -> "Paytm"
            "ybl" -> "PhonePe"
            "amazonpay" -> "Amazon Pay"
            "googlepay" -> "Google Pay"
            "airtel" -> "Airtel Money"
            "freecharge" -> "Freecharge"
            "mobikwik" -> "MobiKwik"
            "jupiteraxis" -> "Jupiter"
            "razorpay" -> "Razorpay"
            "bharatpe" -> "BharatPe"
            else -> null
        }
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("sent") && lowerMessage.contains("from kotak") -> TransactionType.EXPENSE

            lowerMessage.contains("debited") -> TransactionType.EXPENSE
            lowerMessage.contains("withdrawn") -> TransactionType.EXPENSE
            lowerMessage.contains("spent") -> TransactionType.EXPENSE
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
        val upiRefPattern = Regex("UPI\\s+Ref\\s+([0-9]+)", RegexOption.IGNORE_CASE)
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1].trim()
        }

        return super.extractReference(message)
    }

    override fun extractAccountLast4(message: String): String? {
        val kotakAccountPattern =
            Regex("AC\\s+[X*]*([0-9]{4})(?:\\s|,|\\.)", RegexOption.IGNORE_CASE)
        kotakAccountPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("not you") && lowerMessage.contains("fraud")) {
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

        if (lowerMessage.contains("has requested") ||
            lowerMessage.contains("payment request") ||
            lowerMessage.contains("collect request") ||
            lowerMessage.contains("requesting payment") ||
            lowerMessage.contains("requests rs") ||
            lowerMessage.contains("ignore if already paid")
        ) {
            return false
        }

        val kotakTransactionKeywords = listOf(
            "sent",
            "debited", "credited", "withdrawn", "deposited",
            "spent", "received", "transferred", "paid"
        )

        return kotakTransactionKeywords.any { lowerMessage.contains(it) }
    }
}