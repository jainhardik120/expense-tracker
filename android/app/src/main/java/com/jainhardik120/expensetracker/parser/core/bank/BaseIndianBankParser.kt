package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.CompiledPatterns
import com.jainhardik120.expensetracker.parser.core.InvestmentKeywords
import com.jainhardik120.expensetracker.parser.core.MandateInfo
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal
import java.time.LocalDateTime

abstract class BaseIndianBankParser : BankParser() {

    override fun getCurrency() = "INR"

    override fun isInvestmentTransaction(lowerMessage: String): Boolean =
        InvestmentKeywords.matches(lowerMessage)

    open fun isEMandateNotification(message: String): Boolean {
        val lowerMessage = message.lowercase()
        return lowerMessage.contains("e-mandate") ||
                lowerMessage.contains("upi-mandate") ||
                (lowerMessage.contains("mandate") && lowerMessage.contains("successfully created"))
    }

    open fun isFutureDebitNotification(message: String): Boolean {
        val lowerMessage = message.lowercase()
        return WILL_BE_DEBITED.containsMatchIn(lowerMessage) ||
                lowerMessage.contains("to be debited from") ||
                lowerMessage.contains("mandate set for") ||
                (lowerMessage.contains("upcoming") && lowerMessage.contains("mandate"))
    }

    open fun isCardBillPaymentReceipt(message: String): Boolean {
        val lowerMessage = message.lowercase()
        return CARD_PAYMENT_RECEIPTS.any { it.containsMatchIn(lowerMessage) }
    }

    open fun isNotATransactionMessage(message: String): Boolean =
        isFutureDebitNotification(message) || isCardBillPaymentReceipt(message)

    override fun isTransactionMessage(message: String): Boolean {
        if (isNotATransactionMessage(message)) {
            return false
        }
        return super.isTransactionMessage(message)
    }

    open fun parseMandateSubscription(message: String): MandateInfo? {
        if (!isEMandateNotification(message) && !isFutureDebitNotification(message)) {
            return null
        }

        val amount = CompiledPatterns.Amount.INR_PATTERN.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        } ?: CompiledPatterns.Amount.RS_PATTERN.find(message)?.let { match ->
            val amountStr = match.groupValues[1].replace(",", "")
            try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                null
            }
        } ?: return null

        var merchant = "Unknown Subscription"
        val merchantPatterns = listOf(
            Regex("""towards\s+([^.\n]+?)(?:\s+from|\s+A/c|\s+UMRN|\s+ID:|\s+Alert:|\s*\.|$)""", RegexOption.IGNORE_CASE),
            Regex("""for\s+([^.\n]+?)(?:\s+ID:|\s+Act:|\s*\.|$)""", RegexOption.IGNORE_CASE),
            Regex("""Info:\s*([^.\n]+?)(?:\s*$)""", RegexOption.IGNORE_CASE)
        )

        for (pattern in merchantPatterns) {
            pattern.find(message)?.let { match ->
                val m = cleanMerchantName(match.groupValues[1].trim())
                if (isValidMerchantName(m)) merchant = m
            }
        }

        val datePattern = Regex("""(?:on|for)\s+(${CompiledPatterns.Date.DD_MMM_YY.pattern}|${CompiledPatterns.Date.DD_MM_YYYY.pattern})""", RegexOption.IGNORE_CASE)
        val dateStr = datePattern.find(message)?.groupValues?.get(1)?.let { rawDate ->
            rawDate
        }

        val umnPattern = Regex("""UMN[:\s]+([^.\s]+)""", RegexOption.IGNORE_CASE)
        val umn = umnPattern.find(message)?.groupValues?.get(1)

        return object : MandateInfo {
            override val amount = amount
            override val nextDeductionDate = dateStr
            override val merchant = merchant
            override val umn = umn
            override val dateFormat = "dd-MMM-yy"
        }
    }

    open fun isBalanceUpdateNotification(message: String): Boolean {
        val lowerMessage = message.lowercase()

        val hasBalanceKeyword = lowerMessage.contains("available bal") ||
                lowerMessage.contains("avl bal") ||
                lowerMessage.contains("account balance") ||
                lowerMessage.contains("a/c balance") ||
                lowerMessage.contains("updated balance")

        val hasTxnKeyword = lowerMessage.contains("debited") ||
                lowerMessage.contains("credited") ||
                lowerMessage.contains("withdrawn") ||
                lowerMessage.contains("spent") ||
                lowerMessage.contains("transferred") ||
                lowerMessage.contains("payment of")

        return hasBalanceKeyword && !hasTxnKeyword
    }

    data class BaseBalanceUpdateInfo(
        val bankName: String,
        val accountLast4: String?,
        val balance: BigDecimal,
        val asOfDate: LocalDateTime? = null
    )

    open fun parseBalanceUpdate(message: String): BaseBalanceUpdateInfo? {
        if (!isBalanceUpdateNotification(message)) {
            return null
        }

        val accountLast4 = extractAccountLast4(message)

        val balance = extractBalance(message) ?: return null

        return BaseBalanceUpdateInfo(
            bankName = getBankName(),
            accountLast4 = accountLast4,
            balance = balance
        )
    }

    protected fun getMonthNumber(monthAbbr: String): Int {
        return when (monthAbbr.uppercase()) {
            "JAN" -> 1
            "FEB" -> 2
            "MAR" -> 3
            "APR" -> 4
            "MAY" -> 5
            "JUN" -> 6
            "JUL" -> 7
            "AUG" -> 8
            "SEP" -> 9
            "OCT" -> 10
            "NOV" -> 11
            "DEC" -> 12
            else -> 1
        }
    }

    private companion object {
        val WILL_BE_DEBITED = Regex("""will\s+be\s+(?:auto[-\s]?)?debited""", RegexOption.IGNORE_CASE)

        val CARD_PAYMENT_RECEIPTS = listOf(
            Regex(
                """payment\s+of[\s\S]{0,40}?received\s+(?:towards|on|against)[\s\S]{0,40}?card""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """received\s+payment\s+of[\s\S]{0,80}?credited\s+to\s+your[\s\S]{0,30}?card""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """thank\s+you\s+for\s+your\s+payment[\s\S]{0,60}?card""",
                RegexOption.IGNORE_CASE
            )
        )
    }
}
