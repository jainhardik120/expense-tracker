# SMS pipeline audit — 27 Sep 2026

Data: 2,356 SMS read off the phone (`SM-A356E`, via `content://sms/inbox`), replayed
through the real `BankParserFactory` compiled out of `android/.../parser/` as a
standalone JVM harness, then joined against the 551 rows in `sms_notifications`
and the 5,898 rows in `statements`.

**Caveat on the window.** The phone only retains bank SMS from ~13 Apr 2026
onward (earlier bank threads have been deleted — 334 of the 551 DB rows have
bodies that no longer exist on the device). Every rate below is measured over
**2026-04-13 → 2026-09-26**, where both sides are complete.

---

## 1. The gap: 299 of 515 parsed transactions never reached the cloud (58%)

The parser handled them fine — they were lost on upload.

| Month | dropped | uploaded |
|---|---|---|
| 2026-04 | 2 | 19 |
| 2026-05 | 20 | 14 |
| 2026-06 | 55 | 48 |
| 2026-07 | 109 | 44 |
| 2026-08 | 83 | 13 |
| 2026-09 | 30 | 68 |

Silent windows (zero uploads, transactions still happening):

- 08–21 May, 25 May – 08 Jun, 23 Jun – 06 Jul, 17–29 Jul, **06 Aug – 05 Sep** (31 days), 18 Sep

Plus **42 one-off drops on days when other uploads succeeded** — those are not the
auth outage. Before yesterday's WorkManager change the upload ran inline in
`SmsBroadcastReceiver.onReceive`, so any network hiccup or process kill lost the
message with no record kept. That path is now retried, so these should stop.

### What is actually missing from the books: nothing

Of the 299 dropped messages, 188 have a statement with the same amount on the
same day. The remaining 111 looked like genuine gaps, and were not — every
transaction in the outage was entered by hand, some of them clubbed together, so
a single statement covers several messages and the one-to-one match fails. The
earlier `sms-gap-backfill.csv` read those 111 as missing money; it was wrong.

The loss was the record of *which message* each entry came from, not the entries
themselves — which is what the hint engine learns from, and why the backfill
below was worth doing.

## 2. The grid reads the calendar day in UTC, for a user reading in IST

**Corrected after the first pass of this audit.** My first reading was that
`sms_notifications.timestamp` was stored wrongly. It is not. The app runs at
`TZ=UTC`, every naive timestamp column holds a UTC instant, and every display
and grouping path converts to the user's timezone — `summary.ts` does
`(column AT TIME ZONE 'UTC') AT TIME ZONE <tz>`, the UI formats through
`useZonedFormat`. Storage is consistent and the statements are right.

The bulk-import grid is the one path that bypasses that convention.
`buildInitialRow` took the calendar day straight off the instant with local
getters — UTC on the server — so a transaction at 00:28 IST was offered as the
previous day, and `withDatePart` then applied the user's correction in UTC terms
too. Leaving the wrong date alone happened to store the right instant; actually
*correcting* it in the grid pushed the transaction a day the other way.

18 of the 400 most recent imports (4.5%) were shown a date one day before the
one in the message. None of them were stored wrongly — the damage was waiting on
the first person to trust the grid and fix it.

## 3. False positives — messages that are not transactions

| Pattern | n | parsed as | should be |
|---|---|---|---|
| `Dear Cardmember, payment of Rs.X is received towards your YES BANK Credit Card ending 4325` | 8 | **income** | card bill payment = self-transfer; skip or `transfer` |
| `INR 129.00 for Youtube will be auto debited via Axis Bank Credit Card no. XX3771 by <date>` | 4 | credit / expense | a *reminder*, not a debit — skip |
| `INR X debited A/c no. XX7792 … UPI/P2A/…/HARDIK JAIN` | 3 | expense | payee is the account holder → self-transfer |
| `INR X debited … UPI/P2M/…/CRED Club` | 7 | expense | card bill payment → self-transfer |
| `INR 200.00 spent … @UPI_PACHUS FANCY` | 1 | **investment** | expense (see §5) |

The Yes Bank card-payment rows are the worst of these: the same money is already
captured as `Axis → Yes Bank Credit` in `self_transfer_statements`, so the SMS
row double-counts it as fresh income. Four were filed and later deleted by hand
(38 `sms_notifications` rows now point at deleted statements — that is the
cleanup trail).

Note the inconsistency: Axis, ICICI, IndusInd and SBI all emit the same
"payment received towards your card" message and are correctly skipped. Only
Yes Bank's wording slips through `isTransactionMessage`.

---

## 4. False negatives — real money movement the parser drops

| Pattern | n | why |
|---|---|---|
| **Pluxee meal card** — `Rs. X spent from Pluxee Meal Card wallet, card no.xx6497 … at SWIGGY`, plus wallet top-ups and inactivity fees | 7 | **no Pluxee parser exists** — the account is in the app but nothing feeds it |
| **PNB** — `A/c X8365 credited for INR 50000 … by HARDIK JAIN thru UPI`, `Ac XX8365 Debited with Rs.50000.00`, `A/c X8365 debited INR 270 … to BHASKAR H`, bank charges | 4 | `PNBBankParser.canHandle` only accepts `PNBBNK`/`PUNBN`/`PNB`; the real sender is `AX-PNBSMS-S` |
| `Auto Pay of INR 129.00 for YOUTUBEGOOGLE has been processed on your Axis Bank Card no. XX3771` | 6 | the real debit — while the *reminder* version (§3) is what gets captured |
| `Payment of INR X has been received towards your Axis Bank Credit Card XX0121` / ICICI via BBPS / IndusInd | 12 | card bill payments; fine to skip, but should be skipped *deliberately* and consistently with Yes Bank |
| `AMAZON WEB SERVICES refund of Rs 2.00 credited to your ICICI Bank Credit Card XX1003`, `IXIGO refund of Rs 2,984` | 2 | parsed as `income`, which maps to a positive outside_transaction — a card refund should reduce the card balance |

There is also **no record of a skipped message anywhere** — if the parser returns
null, the SMS is gone. Adding a local log of unparsed bank-sender messages would
make the next round of this analysis a query instead of an archaeology project.

---

## 5. `isInvestmentTransaction` matches on bare substrings

`BankParser.isInvestmentTransaction` does `lowerMessage.contains(keyword)` over a
list that includes **`"ach"`, `"nse"`, `"ecs"`, `"sip"`, `"ipo"`, `"bse"`,
`"kite"`, `"folio"`, `"demat"`**. Any merchant name containing those letters is
silently reclassified as an investment (→ negative `outside_transaction`, not an
expense).

Already fired once: `UPI_PACHUS FANCY` → `p-ach-us` → `INVESTMENT`. Waiting to
fire: anything with *machine, Sachin, Panchal, achar, consent, licensed, specs,
gossip*, …

Needs word-boundary matching, and the acronyms need a real context guard.

---

## 6. `accountLast4` missing on 19 of 515 messages (stored as `"0000"`)

`SmsTransactionProcessor` defaults a null last4 to `"0000"`, which collapses
unrelated accounts into one hint bucket (`sms-insert-hints` keys on
bank + last4 + merchant).

| Pattern | n | gap |
|---|---|---|
| `Rs X debited from ICICI Bank **Savings Account** XX991 … towards <merchant> for UPI Mandate AutoPay` | 7 | `ICICIBankParser` pattern 3 wants `ICICI Bank Account`, not `… Savings Account` |
| `INR X spent on **IndusInd Card** XX8744` | 5 | `IndusIndBankParser.extractAccountLast4` only handles `IndusInd Account …` / `account XXXXX1234` / `A/C 2134***12345`, never `Card XX####` |
| `Dear Cardmember, payment of Rs.X … YES BANK Credit Card **ending** 4325` | 3 | no `ending ####` pattern (also a false positive, §3) |
| `Rs. X debited from ICICI Bank **Acc** XX991 … IIN*I-Debit*D` | 1 | pattern 4 wants `Acct`, not `Acc` |
| `Rs.8,929.56 spent on your SBI Credit Card **ending** 6080` | 1 | SBI has no `ending ####` pattern |
| `Your A/c has been debited towards Google Cloud for INR 15.79` | 1 | genuinely no account in the message |

Also: `detectIsCard` returns **false** for
`… auto-debited via Axis Bank Card no. XX3771 … sufficient limit/balance on your
card/account …` — the word "account" anywhere in the body vetoes the card
detection, even when it appears in boilerplate.

---

## 7. Inconsistencies worth settling before writing new rules

- Card spends are `credit` at Yes Bank / ICICI / Axis / SBI but `expense` at
  IndusInd. Harmless today (`KIND_BY_SMS_TYPE` maps both to `expense`, sign +1),
  but it means `type` cannot be trusted to mean anything.
- `transfer` exists in the enum and no parser ever produces it, even though
  self-transfers (own-name UPI, card bill payments) are the single largest
  category of junked rows.
- The same transaction arrives from two senders 22 times (e.g. ₹50,000 on 25 Sep
  as both an Axis debit and an ICICI credit — one leg of a self-transfer each).
  Nothing pairs them, so each needs a manual junk.

---

---

# What was changed, 27 Sep

## Parser (Android)

- `InvestmentKeywords` — the shared keyword list, matched on **whole words**.
  `ach`, `nse`, `ecs`, `sip`, `ipo`, `bse` no longer fire inside ordinary payee
  names. The duplicate copy in `BaseIndianBankParser` is gone. IndusInd had the
  same bug locally (`fd`, `ach`, `deposit`) and is fixed the same way.
- `BaseIndianBankParser.isCardBillPaymentReceipt` — the card side of a bill
  payment, in all five banks' wordings, stated once. Yes Bank's phrasing was the
  only one slipping through and it was being stored as income.
- `isFutureDebitNotification` now covers `will be auto debited` / `auto-debited`,
  and Axis's `Auto Pay of INR X for Y has been processed` is recognised as the
  real debit. Previously the reminder was counted and the debit was dropped.
- Account numbers: ICICI `Savings Account` / `Acc`, IndusInd `Card XX####`,
  Yes Bank and SBI `ending ####`, PNB `A/c X8365` and `Ac XX8365`.
- `detectIsCard` checks for a named card before the account-word exclusion, so
  boilerplate like "limit/balance on your card/account" stops un-carding a card.
- New `PluxeeParser`; `PNBBankParser.canHandle` now matches the real `PNBSMS`
  sender.
- Merchant extraction: IndusInd no longer swallows the available limit and the
  dispute helpline, Axis stops at the payee instead of running into the bank and
  rail, ICICI reads the refunding merchant rather than the card.

Verified by replaying all 2,356 messages off the phone through the compiled
parser and diffing against the previous build: 521 → 530 transactions, every
difference intended, nothing regressed. `:app:compileDebugKotlin` passes.

## Server (web)

- `sms-notification-rules.ts` — a payment whose payee is the account holder is
  stored as `transfer`, which the grid flags for redirecting rather than filing.
  Name compared as a set of words, so "JAIN HARDIK" matches and "RUCHITA JAIN"
  does not.
- `formatGridDateInZone` and `withZonedDatePart` — the grid's date is now the
  day in the user's timezone, both when offered and when applied.

## Data

- 311 messages backfilled into `sms_notifications` from the phone's inbox.
  159 matched an existing statement unambiguously (same amount, same IST day,
  same account as every message like it has been filed to) and are linked to it;
  152 had no single statement to point at — entered by hand, often several
  clubbed into one — and are marked junked.
- **No statements were created or modified.** The links point at statements that
  already existed.
- The hint engine now has 217 distinct merchants of history instead of ~100, and
  every bank + last-4 still resolves to exactly one account.

## Not done

- The card-bill-payment *pair* (bank debit + card credit) still needs one manual
  junk each time. Recognising them as a single self transfer needs the grid to
  offer `self_transfer`, which `BULK_IMPORT_KINDS` deliberately excludes.
- Nothing records a message the parser skipped, so false negatives are still
  only findable by dumping the phone.
- The 11 historical rows whose payee is the account holder still carry their
  original `income`/`expense` type. They are already filed; retyping them would
  change the record of how they were entered without changing anything else.
