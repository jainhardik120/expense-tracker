package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class JioPayParser : BankParser() {

    override fun getBankName() = "JioPay"

    override fun canHandle(sender: String): Boolean {
        val normalizedSender = sender.uppercase()
        return normalizedSender.contains("JIOPAY") ||
                normalizedSender.endsWith("-JIOPAY-S") ||
                normalizedSender.endsWith("-JIOPAY-T") ||
                normalizedSender == "JM-JIOPAY"
    }

    override fun extractAmount(message: String): BigDecimal? {
        val planPattern = Regex(
            """Plan\s+Name\s*:\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        planPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val rsPattern = Regex(
            """Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        rsPattern.find(message)?.let { match ->
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
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("recharge successful") && lowerMessage.contains("jio number") -> {
                val numberPattern =
                    Regex("""Jio\s+Number\s*:\s*(\d{10})""", RegexOption.IGNORE_CASE)
                val number = numberPattern.find(message)?.groupValues?.get(1) ?: ""
                if (number.isNotEmpty()) {
                    "Jio Recharge - ${number.take(4)}****"
                } else {
                    "Jio Recharge"
                }
            }

            lowerMessage.contains("bill payment") -> {
                when {
                    lowerMessage.contains("electricity") -> "Electricity Bill"
                    lowerMessage.contains("water") -> "Water Bill"
                    lowerMessage.contains("gas") -> "Gas Bill"
                    lowerMessage.contains("broadband") -> "Broadband Bill"
                    lowerMessage.contains("dth") -> "DTH Recharge"
                    else -> "Bill Payment"
                }
            }

            lowerMessage.contains("recharge") -> {
                when {
                    lowerMessage.contains("mobile") -> "Mobile Recharge"
                    lowerMessage.contains("dth") -> "DTH Recharge"
                    lowerMessage.contains("data") -> "Data Recharge"
                    else -> "Recharge"
                }
            }

            lowerMessage.contains("payment successful to") -> {
                val toPattern =
                    Regex("""payment\s+successful\s+to\s+([^.\n]+)""", RegexOption.IGNORE_CASE)
                toPattern.find(message)?.let { match ->
                    return cleanMerchantName(match.groupValues[1].trim())
                }
                "JioPay Payment"
            }

            else -> super.extractMerchant(message, sender) ?: "JioPay Transaction"
        }
    }

    override fun extractReference(message: String): String? {
        val txnPattern = Regex(
            """Transaction\s+ID\s*:\s*([A-Z0-9]+)""",
            RegexOption.IGNORE_CASE
        )
        txnPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun extractTransactionType(message: String): TransactionType {
        return TransactionType.CREDIT
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lowerMessage = message.lowercase()

        if (lowerMessage.contains("e-bill") ||
            lowerMessage.contains("bill has been sent") ||
            lowerMessage.contains("bill summary") ||
            lowerMessage.contains("payment due date") ||
            lowerMessage.contains("amount payable")
        ) {
            return false
        }

        return lowerMessage.contains("recharge successful") ||
                super.isTransactionMessage(message)
    }
}