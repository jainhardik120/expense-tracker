package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

/**
 * Parser for Pluxee (formerly Sodexo) meal card messages.
 *
 * Pluxee is a prepaid wallet rather than a bank, and it sends only three
 * messages that move money:
 *
 *   "Rs. 668.00 spent from Pluxee  Meal Card wallet, card no.xx6497 on
 *    3-01-2026 15:54:52 at SWIGGY . Avl bal Rs.1532.00. Not you call ..."
 *   "Your Pluxee Card has been successfully credited with Rs.2200 towards
 *    Meal Wallet on Fri Oct 17 2025 11:13:45. Your current Meal Wallet ..."
 *   "Rs.20 deducted from your Pluxee Card xx6497 towards Inactivity Fee."
 *
 * Everything else it sends is an OTP, a settings change, a renewal notice, or a
 * nudge to use the card — including one that reads "has no debit or credit
 * transaction for the last 60 days". So this recognises the three shapes above
 * and nothing else, rather than looking for transaction words in a stream of
 * messages that are mostly about transactions without being one.
 *
 * Common senders: AD-Pluxee-S, VD-Pluxee-S, VM-Pluxee-S, TX-Pluxee-S
 */
class PluxeeParser : BaseIndianBankParser() {

    override fun getBankName() = "Pluxee"

    override fun canHandle(sender: String): Boolean = sender.uppercase().contains("PLUXEE")

    override fun isTransactionMessage(message: String): Boolean =
        SPENT.containsMatchIn(message) ||
                TOPPED_UP.containsMatchIn(message) ||
                DEDUCTED.containsMatchIn(message)

    override fun extractAmount(message: String): BigDecimal? {
        for (pattern in listOf(SPENT, TOPPED_UP, DEDUCTED)) {
            pattern.find(message)?.let { match ->
                return try {
                    BigDecimal(match.groupValues[1].replace(",", ""))
                } catch (e: NumberFormatException) {
                    null
                }
            }
        }
        return null
    }

    override fun extractTransactionType(message: String): TransactionType? = when {
        TOPPED_UP.containsMatchIn(message) -> TransactionType.INCOME
        SPENT.containsMatchIn(message) || DEDUCTED.containsMatchIn(message) ->
            TransactionType.EXPENSE

        else -> null
    }

    override fun extractMerchant(message: String, sender: String): String? {
        // "... at SWIGGY . Avl bal Rs.1532.00" - the trailing space before the
        // full stop is Pluxee's, not a typo here.
        SPENT_MERCHANT.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        // "towards Inactivity Fee." / "towards  Meal Wallet on Fri Oct 17 2025"
        TOWARDS.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

        return null
    }

    override fun extractAccountLast4(message: String): String? {
        for (pattern in CARD_NUMBER_PATTERNS) {
            pattern.find(message)?.let { match ->
                return match.groupValues[1]
            }
        }
        // The top-up message names no card, and Pluxee only ever issues one.
        return null
    }

    override fun extractBalance(message: String): BigDecimal? {
        AVL_BAL.find(message)?.let { match ->
            return try {
                BigDecimal(match.groupValues[1].replace(",", ""))
            } catch (e: NumberFormatException) {
                null
            }
        }
        return super.extractBalance(message)
    }

    private companion object {
        val SPENT = Regex(
            """Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+spent\s+from\s+Pluxee""",
            RegexOption.IGNORE_CASE
        )
        val TOPPED_UP = Regex(
            """Pluxee\s+Card\s+has\s+been\s+successfully\s+credited\s+with\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        val DEDUCTED = Regex(
            """Rs\.?\s*([0-9,]+(?:\.\d{2})?)\s+deducted\s+from\s+your\s+Pluxee""",
            RegexOption.IGNORE_CASE
        )
        val SPENT_MERCHANT = Regex("""\sat\s+([^.]+?)\s*\.\s*Avl""", RegexOption.IGNORE_CASE)
        val TOWARDS = Regex("""towards\s+(.+?)(?:\s+on\s+|\s*\.)""", RegexOption.IGNORE_CASE)
        val CARD_NUMBER_PATTERNS = listOf(
            Regex("""card\s*no\.?\s*[Xx\*]*(\d{4})""", RegexOption.IGNORE_CASE),
            Regex("""Pluxee\s+Card\s+[Xx\*]*(\d{4})""", RegexOption.IGNORE_CASE)
        )
        val AVL_BAL = Regex("""Avl\s+bal\s+Rs\.?\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
    }
}
