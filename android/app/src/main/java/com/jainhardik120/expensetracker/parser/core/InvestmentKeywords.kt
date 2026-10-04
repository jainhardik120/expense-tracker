package com.jainhardik120.expensetracker.parser.core

object InvestmentKeywords {

    private val KEYWORDS = listOf(
        "iccl",
        "indian clearing corporation",
        "nsccl",
        "nse clearing",
        "clearing corporation",

        "nach",
        "ach",
        "ecs",

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

        "mutual fund",
        "sip",
        "elss",
        "ipo",
        "folio",
        "demat",
        "stockbroker",
        "digital gold",
        "sovereign gold",

        "nse",
        "bse",
        "cdsl",
        "nsdl"
    )

    private val PATTERNS = KEYWORDS.map { keyword ->
        val body = keyword.split(" ").map { Regex.escape(it) }.joinToString("""\s+""")
        Regex("""(?<![\p{L}\p{N}])$body(?![\p{L}\p{N}])""", RegexOption.IGNORE_CASE)
    }

    fun matches(message: String): Boolean = PATTERNS.any { it.containsMatchIn(message) }
}
