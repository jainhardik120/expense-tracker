package com.jainhardik120.expensetracker.parser.core.bank

import java.math.BigDecimal

class BandhanBankParser : BaseIndianBankParser() {

    override fun getBankName() = "Bandhan Bank"

    override fun canHandle(sender: String): Boolean {
        val s = sender.uppercase()

        if (s.contains("BANDHAN")) return true

        if (s.matches(Regex("^[A-Z]{2}-BDNSMS(?:-S)?$"))) return true
        if (s.matches(Regex("^[A-Z]{2}-BANDHN(?:-S)?$"))) return true

        return false
    }

    override fun extractMerchant(message: String, sender: String): String? {
        val towardsPattern = Regex(
            """towards\s+([^\.\n]+?)(?:\s+Value|\s+on|\s+dt|\s+at|\.|$)""",
            RegexOption.IGNORE_CASE
        )

        towardsPattern.find(message)?.let { match ->
            var merchantRaw = match.groupValues[1].trim()

            if (merchantRaw.contains("/")) {
                val segments = merchantRaw.split('/').map { it.trim() }.filter { it.isNotEmpty() }
                val candidate = segments.lastOrNull { segment ->
                    segment.length >= 2 && segment.any { it.isLetter() } && !segment.equals(
                        "UPI",
                        ignoreCase = true
                    )
                } ?: segments.lastOrNull()

                if (candidate != null) {
                    merchantRaw = candidate
                }
            }

            val cleanedMerchant = cleanMerchantName(
                merchantRaw.replace(Regex("""\bu\b""", RegexOption.IGNORE_CASE), "").trim()
            )

            val normalizedMerchant = when {
                cleanedMerchant.equals("interest", ignoreCase = true) -> "Interest"
                else -> cleanedMerchant
            }

            if (isValidMerchantName(normalizedMerchant)) {
                return normalizedMerchant
            }
        }

        return super.extractMerchant(message, sender)
    }

    override fun extractReference(message: String): String? {
        val upiReferencePattern = Regex(
            """UPI/[A-Z]{2}/([A-Z0-9]+)""",
            RegexOption.IGNORE_CASE
        )

        upiReferencePattern.find(message)?.let { match ->
            return match.groupValues[1]
        }

        return super.extractReference(message)
    }

    override fun extractBalance(message: String): BigDecimal? {
        val clearBalancePattern = Regex(
            """Clear\s+Bal\s+(?:is\s+)?(?:INR\s*)?([0-9,]+(?:\.\d{2})?)""",
            RegexOption.IGNORE_CASE
        )

        clearBalancePattern.find(message)?.let { match ->
            val balanceStr = match.groupValues[1].replace(",", "")
            return try {
                BigDecimal(balanceStr)
            } catch (_: NumberFormatException) {
                null
            }
        }

        return super.extractBalance(message)
    }
}
