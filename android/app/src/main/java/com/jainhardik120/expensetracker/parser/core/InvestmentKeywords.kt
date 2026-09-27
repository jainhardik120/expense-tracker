package com.jainhardik120.expensetracker.parser.core

/**
 * The words that mark a debit as money going into an investment rather than
 * being spent.
 *
 * Matched on whole words. A plain `contains` reads half the list as a substring
 * of an ordinary payee name — `ach` alone turns `UPI_PACHUS FANCY` into an
 * investment, and `nse`, `ecs`, `sip`, `ipo` and `bse` are hiding inside
 * *consent*, *specs*, *gossip* and any number of names. The acronyms are the
 * point of the list, though, so the fix is the boundary, not dropping them.
 *
 * The patterns are built once: this runs against every message that arrives.
 */
object InvestmentKeywords {

    private val KEYWORDS = listOf(
        // Clearing corporations
        "iccl",                         // Indian Clearing Corporation Limited
        "indian clearing corporation",
        "nsccl",                        // NSE Clearing Corporation
        "nse clearing",
        "clearing corporation",

        // Auto-pay indicators (excluding mandate/UMRN to avoid subscription false positives)
        "nach",                         // National Automated Clearing House
        "ach",                          // Automated Clearing House
        "ecs",                          // Electronic Clearing Service

        // Investment platforms
        "groww",
        "zerodha",
        "upstox",
        "kite",
        "kuvera",
        "paytm money",
        "etmoney",
        "coin by zerodha",
        "smallcase",
        "angel one",
        "angel broking",
        "5paisa",
        "icici securities",
        "icici direct",
        "hdfc securities",
        "kotak securities",
        "motilal oswal",
        "sharekhan",
        "edelweiss",
        "axis direct",
        "sbi securities",

        // Investment types
        "mutual fund",
        "sip",                          // Systematic Investment Plan
        "elss",                         // Tax saving funds
        "ipo",                          // Initial Public Offering
        "folio",                        // Mutual fund folio
        "demat",
        "stockbroker",
        "digital gold",                 // Digital Gold investments
        "sovereign gold",               // Sovereign Gold Bonds

        // Stock exchanges
        "nse",                          // National Stock Exchange
        "bse",                          // Bombay Stock Exchange
        "cdsl",                         // Central Depository Services
        "nsdl"                          // National Securities Depository
    )

    /**
     * A keyword is a match only where a letter or digit does not run straight
     * into it on either side. Spaces inside a keyword are left to match one or
     * more, because banks pad merchant names unevenly.
     */
    private val PATTERNS = KEYWORDS.map { keyword ->
        val body = keyword.split(" ").map { Regex.escape(it) }.joinToString("""\s+""")
        Regex("""(?<![\p{L}\p{N}])$body(?![\p{L}\p{N}])""", RegexOption.IGNORE_CASE)
    }

    fun matches(message: String): Boolean = PATTERNS.any { it.containsMatchIn(message) }
}
