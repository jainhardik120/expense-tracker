package com.jainhardik120.expensetracker.parser.core.bank

import com.jainhardik120.expensetracker.parser.core.TransactionType
import java.math.BigDecimal
import java.time.LocalDateTime

class IndusIndBankParser : BaseIndianBankParser() {

    override fun getBankName() = "IndusInd Bank"

    override fun canHandle(sender: String): Boolean {
        val s = sender.uppercase()

        if (s == "INDUSB" || s == "INDUSIND" || s.contains("INDUSIND BANK")) return true

        if (s.matches(Regex("^[A-Z]{2}-INDUSB(?:-[A-Z])?$"))) return true
        if (s.matches(Regex("^[A-Z]{2}-INDUSIND(?:-[A-Z])?$"))) return true

        if (s.matches(Regex("^[A-Z]{2}-INDUS(?:[A-Z]{2,})?-[A-Z]$"))) return true

        return false
    }

    override fun extractTransactionType(message: String): TransactionType? {
        val lower = message.lowercase()
        return when {
            lower.contains("spent") -> TransactionType.EXPENSE
            lower.contains("debited") -> TransactionType.EXPENSE
            lower.contains("purchase") -> TransactionType.EXPENSE
            DEPOSIT_CUES.containsMatchIn(lower) -> TransactionType.INVESTMENT
            else -> super.extractTransactionType(message)
        }
    }

    private companion object {
        val DEPOSIT_CUES = Regex(
            """(?<![\p{L}\p{N}])(?:deposits?|fd|ach)(?![\p{L}\p{N}])""",
            RegexOption.IGNORE_CASE
        )
    }

    override fun detectIsCard(message: String): Boolean {
        val lower = message.lowercase()
        val isAchOrNach =
            lower.contains("ach db") || lower.contains("ach cr") || lower.contains("nach")
        if (isAchOrNach) return false
        return super.detectIsCard(message)
    }

    override fun isBalanceUpdateNotification(message: String): Boolean {
        val lower = message.lowercase()
        val hasBalanceCue = lower.contains("avl bal") ||
                lower.contains("available bal") ||
                lower.contains("account balance") ||
                lower.contains("a/c balance")
        val hasTxnVerb = listOf("debited", "credited", "withdrawn", "spent", "transferred")
            .any { lower.contains(it) }
        return hasBalanceCue && lower.contains("as on") && !hasTxnVerb
    }

    override fun parseBalanceUpdate(message: String): BaseBalanceUpdateInfo? {
        if (!isBalanceUpdateNotification(message)) return null

        val accountLast4 = extractAccountLast4(message) ?: return null

        val p1 = Regex("""Avl\s*BAL\s+of\s+INR\s*([0-9,]+(?:\.\d{2})?)""", RegexOption.IGNORE_CASE)
        val balance = p1.find(message)?.let { m ->
            runCatching { BigDecimal(m.groupValues[1].replace(",", "")) }.getOrNull()
        } ?: run {
            val p2 = Regex(
                """(?:Avl\s*BAL|Available\s+Balance(?:\s+is)?|Bal)[:\s]+INR\s*([0-9,]+(?:\.\d{2})?)""",
                RegexOption.IGNORE_CASE
            )
            p2.find(message)?.let { m ->
                runCatching { BigDecimal(m.groupValues[1].replace(",", "")) }.getOrNull()
            }
        } ?: return null

        val datePattern = Regex(
            """as\s+on\s+(\d{1,2}/\d{1,2}/\d{2})\s+(\d{1,2}:\d{2})\s*(AM|PM)""",
            RegexOption.IGNORE_CASE
        )
        val asOfDate = datePattern.find(message)?.let { match ->
            val dateParts = match.groupValues[1].split("/")
            val timeParts = match.groupValues[2].split(":")
            val ampm = match.groupValues[3].uppercase()
            runCatching {
                val day = dateParts[0].toInt()
                val month = dateParts[1].toInt()
                val year = 2000 + dateParts[2].toInt()
                var hour = timeParts[0].toInt()
                val minute = timeParts[1].toInt()
                hour = when {
                    ampm == "PM" && hour < 12 -> hour + 12
                    ampm == "AM" && hour == 12 -> 0
                    else -> hour
                }
                LocalDateTime.of(year, month, day, hour, minute)
            }.getOrNull()
        }

        return BaseBalanceUpdateInfo(
            bankName = getBankName(),
            accountLast4 = accountLast4,
            balance = balance,
            asOfDate = asOfDate
        )
    }

    override fun isTransactionMessage(message: String): Boolean {
        val lower = message.lowercase()
        if (lower.contains("net interest") && lower.contains("deposit no")) {
            return false
        }
        return super.isTransactionMessage(message)
    }

    override fun extractAmount(message: String): java.math.BigDecimal? {
        val verbAmountPattern = Regex(
            """(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.\d{2})?)\s+(?:debited|credited|spent|withdrawn|paid|purchase)""",
            RegexOption.IGNORE_CASE
        )
        verbAmountPattern.find(message)?.let { match ->
            val amt = match.groupValues[1].replace(",", "")
            return try {
                java.math.BigDecimal(amt)
            } catch (_: NumberFormatException) {
                null
            }
        }

        return super.extractAmount(message)
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val towardsPattern = Regex("""towards\s+(\S+)""", RegexOption.IGNORE_CASE)
        towardsPattern.find(message)?.let { match ->
            var m = match.groupValues[1].trim().trimEnd('.', ',', ';')
            if (m.contains("/")) m = m.substringBefore("/")
            if (m.contains("@")) m = m.substringBefore("@").trim()
            if (m.isNotEmpty()) return cleanMerchantName(m)
        }

        val fromAccountPattern = Regex("""from\s+account\s+[^\s/]+/([^\s(]+)""", RegexOption.IGNORE_CASE)
        fromAccountPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim().trimEnd('.', ',', ';', ')')
            if (merchant.isNotEmpty()) return cleanMerchantName(merchant)
        }

        val fromPattern = Regex("""from\s+(\S+)""", RegexOption.IGNORE_CASE)
        fromPattern.find(message)?.let { match ->
            val token = match.groupValues[1].trim().trimEnd('.', ',', ';')
            var m = token
            if (m.contains("/")) m = m.substringBefore("/")
            if (m.contains("@")) {
                m = m.substringBefore("@").trim()
                if (m.isNotEmpty()) return cleanMerchantName(m)
            }
        }

        val atPattern = Regex("""\bat\s+([^.\n]+?)(?:\s+Ref\b|\s+on\b|\s*\.|$)""", RegexOption.IGNORE_CASE)
        atPattern.find(message)?.let { match ->
            val merchant = match.groupValues[1].trim().removePrefix("UPI ").trim()
            if (merchant.isNotEmpty()) return cleanMerchantName(merchant)
        }

        val merchantBeforeBal = Regex("""/(?!\s)([^/\.\s]+)\.\s*Bal""", RegexOption.IGNORE_CASE)
        merchantBeforeBal.find(message)?.let { match ->
            val m = match.groupValues[1].trim()
            if (m.isNotEmpty()) return cleanMerchantName(m)
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractAccountLast4(message: String): String? {
        val indusIndAccountPattern = Regex(
            """IndusInd\s+Account\s+\d+X+(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        indusIndAccountPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val accountXPattern = Regex(
            """account\s+X{5,}(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        accountXPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val cardPattern = Regex(
            """IndusInd(?:\s+Bank)?(?:\s+\w+)?\s+Card\s+[Xx\*]*(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        cardPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val cardEndingPattern = Regex(
            """Card\s+(?:no\.?\s+)?ending\s+[Xx]*(\d{4})""",
            RegexOption.IGNORE_CASE
        )
        cardEndingPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val maskedPattern = Regex(
            """A/?C\s+([0-9]{2,})[\*xX#]+(\d{4,})""",
            RegexOption.IGNORE_CASE
        )
        maskedPattern.find(message)?.let { match ->
            val trailing = match.groupValues[2]
            return if (trailing.length >= 4) trailing.takeLast(4) else trailing
        }

        val starMaskPattern = Regex(
            """A/?c\s+\*?X+\s*(\d{4,6})""",
            RegexOption.IGNORE_CASE
        )
        starMaskPattern.find(message)?.let { match ->
            val digits = match.groupValues[1]
            return if (digits.length >= 4) digits.takeLast(4) else digits
        }

        val lower = message.lowercase()
        if (lower.contains("ach db") || lower.contains("ach cr") || lower.contains("nach")) {
            return null
        }

        return null
    }

    override fun extractBalance(message: String): java.math.BigDecimal? {
        val pattern1 = Regex(
            """Avl\s*BAL\s+of\s+INR\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        pattern1.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                java.math.BigDecimal(balanceStr)
            } catch (_: NumberFormatException) {
                null
            }
        }

        val pattern2 = Regex(
            """(?:Avl\s*BAL|Available\s+Balance(?:\s+is)?|Bal)[:\s]+INR\s*([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )
        pattern2.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                java.math.BigDecimal(balanceStr)
            } catch (_: NumberFormatException) {
                null
            }
        }

        return super.extractBalance(message)
    }

    override fun extractReference(message: String): String? {
        val rrnPattern = Regex("""RRN[:\s]+([0-9]+)""", RegexOption.IGNORE_CASE)
        rrnPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        val refNoPattern = Regex("""(?:IMPS\s+)?Ref\s+no\.?\s*([0-9]+)""", RegexOption.IGNORE_CASE)
        refNoPattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

}
