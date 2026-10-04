package com.jainhardik120.expensetracker.parser.core

import java.math.BigDecimal

interface MandateInfo {
    val amount: BigDecimal

    val nextDeductionDate: String?

    val merchant: String

    val umn: String?

    val dateFormat: String
        get() = "dd/MM/yy"
}