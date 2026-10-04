package com.jainhardik120.expensetracker.parser.core

import java.math.BigDecimal
import java.security.MessageDigest

data class ParsedTransaction(
    val amount: BigDecimal,
    val type: TransactionType,
    val merchant: String?,
    val reference: String?,
    val accountLast4: String?,
    val balance: BigDecimal?,
    val creditLimit: BigDecimal? = null,
    val smsBody: String,
    val sender: String,
    val timestamp: Long,
    val bankName: String,
    val transactionHash: String? = null,
    val isFromCard: Boolean = false,
    val currency: String = "INR",
    val fromAccount: String? = null,
    val toAccount: String? = null
) {
    fun generateTransactionId(): String {
        val normalizedAmount = amount.setScale(2, java.math.RoundingMode.HALF_UP)
        val smsBodyHash = MessageDigest.getInstance("MD5")
            .digest(smsBody.toByteArray())
            .joinToString("") { "%02x".format(it) }
            .take(16)
        val data = "$sender|$normalizedAmount|$smsBodyHash"
        return MessageDigest.getInstance("MD5")
            .digest(data.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }
}

