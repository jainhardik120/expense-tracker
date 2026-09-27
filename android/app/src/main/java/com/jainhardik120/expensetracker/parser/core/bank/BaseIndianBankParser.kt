package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.CompiledPatterns
import com.jainhardik120.expensetracker.parser.core.InvestmentKeywords
import com.jainhardik120.expensetracker.parser.core.MandateInfo
import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal
import java.time.LocalDateTime

/**
 * Base abstract class for Indian bank parsers.
 * Handles common patterns across Indian banks (INR currency, UPI, etc.).
 */
abstract class BaseIndianBankParser : BankParser() {

    override fun getCurrency() = "INR"

    /**
     * Checks if the message is for an investment transaction.
     *
     * The keyword list is shared with the base parser rather than repeated here;
     * the two copies had already drifted apart once.
     */
    override fun isInvestmentTransaction(lowerMessage: String): Boolean =
        InvestmentKeywords.matches(lowerMessage)

    // ==========================================
    // Unified Mandate / Subscription Logic
    // ==========================================

    /**
     * Checks if this is an E-Mandate notification (not a transaction).
     */
    open fun isEMandateNotification(message: String): Boolean {
        val lowerMessage = message.lowercase()
        return lowerMessage.contains("e-mandate") ||
                lowerMessage.contains("upi-mandate") ||
                (lowerMessage.contains("mandate") && lowerMessage.contains("successfully created"))
    }

    /**
     * Checks if this is a future debit notification (subscription alert, not a current transaction).
     *
     * "will be auto debited" is the wording Axis uses for its standing
     * instruction reminders, and it was landing as a real debit three days
     * before the money moved -- while the message that announces the actual
     * debit ("Auto Pay ... has been processed") was being skipped. So the
     * transaction was recorded once, on the wrong day.
     */
    open fun isFutureDebitNotification(message: String): Boolean {
        val lowerMessage = message.lowercase()
        return WILL_BE_DEBITED.containsMatchIn(lowerMessage) ||
                lowerMessage.contains("to be debited from") ||
                lowerMessage.contains("mandate set for") ||
                (lowerMessage.contains("upcoming") && lowerMessage.contains("mandate"))
    }

    /**
     * Checks if this is a credit card bill being paid off, seen from the card's side.
     *
     * Money moving from a bank account to a card is one transfer, and the bank
     * account's own debit message already reports it. Counting the card's
     * acknowledgement as well reads a bill payment as fresh income.
     *
     * Every bank words this differently and most of them happened to fall
     * through the transaction-keyword test already; Yes Bank's phrasing did not,
     * which is why this is stated once rather than left to chance per bank.
     */
    open fun isCardBillPaymentReceipt(message: String): Boolean {
        val lowerMessage = message.lowercase()
        return CARD_PAYMENT_RECEIPTS.any { it.containsMatchIn(lowerMessage) }
    }

    /**
     * Messages that name an amount and an account but move no money right now.
     *
     * Checked before anything a bank parser recognises as a transaction, so a
     * bank-specific keyword cannot readmit one of them.
     */
    open fun isNotATransactionMessage(message: String): Boolean =
        isFutureDebitNotification(message) || isCardBillPaymentReceipt(message)

    override fun isTransactionMessage(message: String): Boolean {
        if (isNotATransactionMessage(message)) {
            return false
        }
        return super.isTransactionMessage(message)
    }

    /**
     * Parses combined Mandate / E-Mandate / UPI-Mandate subscription information.
     * Returns a general MandateInfo implementation.
     */
    open fun parseMandateSubscription(message: String): MandateInfo? {
        if (!isEMandateNotification(message) && !isFutureDebitNotification(message)) {
            return null
        }

        // 1. Extract amount
        // Patterns: "Rs.1050.00", "INR 59.00", "Rs 123.45"
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

        // 2. Extract merchant
        // Patterns: "towards Google Play", "for Netflix", "Info: Spotify"
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

        // 3. Extract date (for future debits)
        // Patterns: "on 29-May-25", "set for 29-May-25"
        // Matches DD-MMM-YY, dd/MM/yyyy formats common in Indian banks
        val datePattern = Regex("""(?:on|for)\s+(${CompiledPatterns.Date.DD_MMM_YY.pattern}|${CompiledPatterns.Date.DD_MM_YYYY.pattern})""", RegexOption.IGNORE_CASE)
        val dateStr = datePattern.find(message)?.groupValues?.get(1)?.let { rawDate ->
            // Normalize slashes to dashes if needed or keep as is, consumer will parse
            rawDate
        }

        // 4. Extract UMN (Unique Mandate Number) if present
        val umnPattern = Regex("""UMN[:\s]+([^.\s]+)""", RegexOption.IGNORE_CASE)
        val umn = umnPattern.find(message)?.groupValues?.get(1)

        return object : MandateInfo {
            override val amount = amount
            override val nextDeductionDate = dateStr
            override val merchant = merchant
            override val umn = umn
            override val dateFormat = "dd-MMM-yy" // Default fallback
        }
    }

    // ==========================================
    // Unified Balance Update Logic
    // ==========================================

    /**
     * Checks if this is a balance update notification (not a transaction).
     */
    open fun isBalanceUpdateNotification(message: String): Boolean {
        val lowerMessage = message.lowercase()

        // Check for balance update patterns
        // Must contain "Available Balance" or similar keywords
        // And typically "as on" or "is Rs." without transaction words like "debited", "spent"
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

    /**
     * Parses generic balance update notification.
     */
    open fun parseBalanceUpdate(message: String): BaseBalanceUpdateInfo? {
        if (!isBalanceUpdateNotification(message)) {
            return null
        }

        // Extract account last 4 digits
        val accountLast4 = extractAccountLast4(message)

        // Extract balance amount
        // Patterns: "is Rs. 12,345", "Avl Bal Rs 12345"
        val balance = extractBalance(message) ?: return null

        return BaseBalanceUpdateInfo(
            bankName = getBankName(),
            accountLast4 = accountLast4,
            balance = balance
        )
    }

    // ==========================================
    // Common Helper Methods
    // ==========================================

    /**
     * Helper function to convert month abbreviation to number.
     */
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
        /** "will be debited", "will be auto debited", "will be auto-debited". */
        val WILL_BE_DEBITED = Regex("""will\s+be\s+(?:auto[-\s]?)?debited""", RegexOption.IGNORE_CASE)

        /**
         * A payment landing *on* a card, in each bank's wording. All of them
         * require the word "payment", so a merchant refund ("An amount of INR
         * 6411 received on your YES BANK Credit Card ... from IXIGO") is left
         * alone -- that one really does change what the card owes.
         */
        val CARD_PAYMENT_RECEIPTS = listOf(
            // Yes Bank: "payment of Rs.7,335.89 is received towards your YES BANK Credit Card ending 4325"
            // Axis:     "Payment of INR 12497.95 has been received towards your Axis Bank Credit Card XX0121"
            // ICICI:    "Payment of Rs 4,298.87 has been received on your ICICI Bank Credit Card XX1003"
            Regex(
                """payment\s+of[\s\S]{0,40}?received\s+(?:towards|on|against)[\s\S]{0,40}?card""",
                RegexOption.IGNORE_CASE
            ),
            // SBI: "We have received payment of Rs.3,068.00 via BBPS & the same has been credited to your SBI Credit Card"
            Regex(
                """received\s+payment\s+of[\s\S]{0,80}?credited\s+to\s+your[\s\S]{0,30}?card""",
                RegexOption.IGNORE_CASE
            ),
            // IndusInd: "thank you for your Payment of INR 255.00 towards your IndusInd Bank Credit Card"
            Regex(
                """thank\s+you\s+for\s+your\s+payment[\s\S]{0,60}?card""",
                RegexOption.IGNORE_CASE
            )
        )
    }
}
