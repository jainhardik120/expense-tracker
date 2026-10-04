package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal

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
        SPENT_MERCHANT.find(message)?.let { match ->
            val merchant = cleanMerchantName(match.groupValues[1].trim())
            if (isValidMerchantName(merchant)) {
                return merchant
            }
        }

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
