package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.MandateInfo
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

class IndianBankParser : BaseIndianBankParser() {
    override fun getBankName() = "Indian Bank"

    override fun canHandle(sender: String): Boolean {
        val normalized = sender.uppercase()
        return normalized.contains("INDIAN BANK") ||
                normalized.contains("INDIANBANK") ||
                normalized.contains("INDIANBK") ||
                normalized.matches(Regex("^[A-Z]{2}-INDBNK-S$")) ||
                normalized.matches(Regex("^[A-Z]{2}-INDBNK-[TPG]$")) ||
                normalized.matches(Regex("^[A-Z]{2}-INDBNK$")) ||
                normalized == "INDBNK" ||
                normalized == "INDIAN"
    }

    override fun extractAmount(message: String): BigDecimal? {
        val debitPattern =
            Regex("""debited\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        debitPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val creditPattern =
            Regex("""credited\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        creditPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val creditPatternReverse = Regex(
            """Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+credited\s+to""",
            RegexOption.IGNORE_CASE
        )
        creditPatternReverse.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val withdrawnPattern =
            Regex("""withdrawn\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        withdrawnPattern.find(message)?.let { match ->
            val amount = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(amount)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val upiPattern = Regex(
            """UPI\s+payment\s+of\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""",
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

        return super.extractAmount(message)
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val toPattern = Regex("""to\s+([^.\n]+?)(?:\.\s*UPI:|UPI:|$)""", RegexOption.IGNORE_CASE)
        toPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val fromPattern =
            Regex("""from\s+([^.\n]+?)(?:\.\s*UPI:|UPI:|$)""", RegexOption.IGNORE_CASE)
        fromPattern.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        val vpaPattern = Regex("""VPA\s+([\w.-]+@[\w]+)""", RegexOption.IGNORE_CASE)
        vpaPattern.find(message)?.let { match ->
            val vpa = match.groupValues[1]
            val merchantFromVpa = vpa.substringBefore("@")
            return cleanMerchantName(merchantFromVpa)
        }

        val atmPattern =
            Regex("""ATM\s+(?:withdrawal\s+)?at\s+([^.\n]+?)(?:\s+on|$)""", RegexOption.IGNORE_CASE)
        atmPattern.find(message)?.let { match ->
            val location = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(location)) {
                return "ATM - $location"
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val pattern1 = Regex("""A/c\s+\*(\d{4})""", RegexOption.IGNORE_CASE)
        pattern1.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val pattern2 = Regex("""Account\s+X*(\d{4})""", RegexOption.IGNORE_CASE)
        pattern2.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val pattern3 = Regex("""A/c\s+ending\s+(\d{4})""", RegexOption.IGNORE_CASE)
        pattern3.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractAccountLast4(message)
    }

    override fun extractReference(message: String): String? {
        val upiRefPattern = Regex("""UPI:(\d+)""", RegexOption.IGNORE_CASE)
        upiRefPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val upiRefNoPattern = Regex("""UPI\s+Ref\s+no\s+(\d+)""", RegexOption.IGNORE_CASE)
        upiRefNoPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val refNoPattern = Regex("""Ref\s+No\.?\s*(\w+)""", RegexOption.IGNORE_CASE)
        refNoPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val txnIdPattern = Regex("""Transaction\s+ID:?\s*(\w+)""", RegexOption.IGNORE_CASE)
        txnIdPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val balPattern1 =
            Regex("""Bal\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        balPattern1.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        val balPattern2 = Regex(
            """Available\s+Balance:?\s+Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        balPattern2.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (e: NumberFormatException) {
                null
            }
        }

        return super.extractBalance(message)
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lowerMessage = message.lowercase()

        return when {
            lowerMessage.contains("debited") -> TransactionType.EXPENSE
            lowerMessage.contains("withdrawn") -> TransactionType.EXPENSE
            lowerMessage.contains("upi payment") && !lowerMessage.contains("received") -> TransactionType.EXPENSE

            lowerMessage.contains("credited") -> TransactionType.INCOME
            lowerMessage.contains("deposited") -> TransactionType.INCOME
            lowerMessage.contains("received") -> TransactionType.INCOME

            else -> super.extractTransactionType(message)
        }
    }

    fun isMandateNotification(message: String): Boolean {
        return isEMandateNotification(message) || isFutureDebitNotification(message)
    }

    override fun parseMandateSubscription(message: String): IndianMandateInfo? {
        val baseInfo = super.parseMandateSubscription(message) ?: return null

        return IndianMandateInfo(
            amount = baseInfo.amount,
            nextDeductionDate = baseInfo.nextDeductionDate,
            merchant = baseInfo.merchant,
            umn = baseInfo.umn
        )
    }

    data class IndianMandateInfo(
        override val amount: BigDecimal,
        override val nextDeductionDate: String?,
        override val merchant: String,
        override val umn: String?
    ) : MandateInfo {
        override val dateFormat = "dd-MMM-yy"
    }
}

