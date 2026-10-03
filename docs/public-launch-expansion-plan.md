# Expansion plan: from one person's ledger to a public product

Written 2026-10-02, against `master` at `19ebf07`, plus the unmerged
`feature/friend-account-linking`.

This is not a feature wishlist. It is an audit of what the app assumes about its
user, which of those assumptions only hold for one person, and what has to change
— in that order — before a stranger can sign up and get value.

---

## 0. What exists today

Worth stating plainly, because the gaps only make sense against it. This is a
large, unusually complete system.

**Ledger core.** `statements` carries four kinds (`expense`,
`outside_transaction`, `friend_transaction`, `self_transfer`) with DB-level check
constraints enforcing which of `accountId`/`friendId` each kind may fill.
`selfTransferStatements` is a separate table. `splits` divides a statement among
friend profiles. Running balance per account, reconciled against the bank to
₹0.00 over 3,162 entries.

**Capture.** An Android app with ~90 hand-written bank SMS parsers
(`parser/core/bank`) covering India plus UAE, Egypt, Nepal, Tanzania, Kenya,
US and Colombia; an upload worker; a server-side review queue
(`smsNotifications`, status `pending → inserted | junked`) with insert hints and
bulk import. CSV bulk import with per-row validation and date-format control.

**Commitments.** `emis` with full amortisation — principal, tenure, rate,
processing fees, GST, IAFE — tied to `creditCardAccounts`. `recurringPayments`
with five frequencies, schedule generation and settle-detection against real
statements. Credit-card billing dates and outstanding-balance projection.

**Income.** A genuinely sophisticated salary model: components (earning /
deduction, monthly / one-time, regular / tax-withholding / provident-fund,
proratable, taxable), revisions with effective dates and pay-day rules
(`exact` / `previous_weekday`), bonuses with estimated vs actual, per-payment
component snapshots, and Indian new-regime tax settings per financial year.

**Budget.** A waterfall: ordered `budgetLines`, each with a jsonb `rule` that
claims statements (first match wins), five allocation kinds including `residual`,
`earmarked` and `schedule`, discretionary/closed flags, income lines that route
to the waterfall or to a single line, and projection with safe-to-spend per month.

**Assets.** `investments` across FD, stocks (IN/US), mutual funds, crypto,
commodities, EPFO, RSU; live price enrichment via Yahoo/CoinGecko with
purchase-date and current FX for USD positions.

**Reporting.** Per-user PDF report templates — an input schema, a code step that
runs in a WASM sandbox, an output schema and a json-render spec — rendered
identically to screen and to PDF. 119 hyperlinks in the generated report.

**Platform.** Next.js 16 / React 19 / tRPC 11 / Drizzle / Postgres. better-auth
with passkeys, TOTP 2FA, API keys, admin plugin, and a full OAuth provider so the
Android app authenticates by OIDC. A REST surface via `trpc-to-openapi`.
OpenTelemetry, PostHog, Winston. Privacy / terms / support / delete-account pages.
An experimental AI assistant with 20-step tool loops, off by default.
131 unit tests across 11 files.

**In flight.** `feature/friend-account-linking`: email invitations on
`friendsProfiles`, reciprocal `linkedUserId`/`linkedProfileId`, mirrored
statements (`mirrorOfSplitId` / `mirrorOfStatementId` with partial unique
indexes, `categoryOverridden` so their wording is only a starting point), and a
`friendStatementInbox` for the genuinely ambiguous case — money moving between two
people has two readings and only the recipient can say which. Server and schema
only; no UI yet.

That is more financial modelling than most commercial apps attempt. The problem
is not capability.

---

## 1. The three assumptions that don't survive contact with strangers

### 1.1 "The user already knows their numbers"

Every screen is built for someone who wants the arithmetic to *agree* with
reality they already understand. The landing page's hero is a reconciliation
strip showing a ₹0.00 gap. That is a connoisseur's pleasure.

The median person downloading an expense tracker does not know their numbers and
does not want to reconcile. They want to be told where their money went, having
done almost nothing. The gap between "enters every transaction and ties it to the
bank" and "wants to be told" is the single widest gap in this product, and no
individual feature closes it.

**Consequence:** the default path must become *passive capture → automatic
classification → a readable answer*, with manual precision available for those
who want it. Today manual precision is the only path.

### 1.2 "The user is me"

Concretely, the app assumes: salaried, single employer, Indian new tax regime with
a ₹75,000 standard deduction, INR, one currency, lives in IST, a financial year
starting in April, credit-card EMIs rather than loans, RSUs, EPFO, and a mental
model where a budget is a waterfall of ordered claims.

Each of those is a wall for someone else:

| Assumption | Who it excludes |
|---|---|
| Single salary, modelled in components | Freelancers, business owners, students, retirees, two-income households, anyone paid irregularly |
| EMIs are credit-card EMIs (`emis.creditId` → `creditCardAccounts`, NOT NULL) | **Anyone with a home loan, car loan, education loan or personal loan** — not representable at all |
| INR, en-IN currency, en-US dates, hardcoded | Everyone outside India; also anyone holding a foreign account |
| New-regime tax only, standard deduction defaulted | Old-regime filers, 80C/80D/HRA claimants, capital-gains filers, non-Indians |
| Budget as an ordered jsonb rule waterfall | Almost everyone — this requires thinking like its author |
| Friends are names in *your* ledger | Addressed by the linking branch |
| Categories are free-text strings you happen to have typed | A new user sees a blank autocomplete and has to invent a taxonomy |

### 1.3 "There is one user"

The operational posture is single-tenant:

- `src/lib/db.ts` sets `max: 1` deliberately — the comment explains Aiven allows
  20 connections, 17 usable, and Vercel Fluid freezes instances so
  `idleTimeoutMillis` never fires. **Seventeen warm instances exhausts the
  database.** This is the hard ceiling on public launch and nothing else matters
  until it moves.
- No application-level rate limiting anywhere (only better-auth's API-key
  limits, in `auth-schema.ts`).
- No background job runner. Nothing is scheduled: recurring payments never post
  themselves, prices refresh only when someone looks, no digests, no reminders.
- The admin surface is `listUsers` and `createTrustedOAuthClient`. There is no
  way to help a user who writes in.
- `REDIS_URL` is declared in `env.ts` and used nowhere.
- Tests are 11 unit files over pure functions. There are **no router tests and no
  multi-tenant isolation tests**. For an app about to hold other people's
  financial data, that is the gap I would lose sleep over.

---

## 2. Launch blockers (P0 — before a second person logs in)

Ordered by what stops you, not by effort.

### 2.1 Connection pooling

`max: 1` is a workaround for having no pooler. Options, best first:

1. **Move to a Postgres with a built-in pooler** — Neon (with
   `@neondatabase/serverless` over HTTP, no connection at all), or Supabase
   (Supavisor in transaction mode). Either removes the ceiling and lets you go
   back to a sane `max`, which also un-serialises the `Promise.all` in
   `buildReportInput`.
2. **Put PgBouncer in front of Aiven** in transaction-pooling mode. Cheaper to
   decide, more to operate; note prepared statements need `prepare: false`-style
   handling with Drizzle's node-postgres driver.

Non-negotiable. Everything in this document assumes it is done.

### 2.2 A multi-tenant isolation test suite

Every router procedure, asserted to be unreachable with another user's row ID.
The handlers mostly do this correctly (`accountBelongToUser`, `friendBelongToUser`,
`and(eq(id), eq(userId))`), which is exactly why it needs tests — the pattern is
by convention, not by construction. Two specific things to verify:

- `statements.accountId` and `statements.friendId` use `onDelete: 'no action'`
  while both parents cascade from `user`. Confirm a user deletion actually
  succeeds under load rather than erroring on a constraint. `/delete-account`
  exists; prove it works end to end.
- `splits.friendId` is only validated against the user in some paths. Audit
  `addStatementSplit` / `updateStatementSplit` / `bulkSplit` specifically.

Consider belt-and-braces Postgres RLS with the user ID as a session variable, so
isolation is enforced by the database rather than by every author remembering.

### 2.3 Rate limiting and abuse

tRPC has none. The expensive paths are `/api/pdf-report` (renders PDFs),
`/api/chat` (spends an AI gateway key, 20 tool steps), the investment enrichment
path (hits Yahoo and CoinGecko per request, uncached) and bulk import. Add a
limiter keyed on user ID, plus idempotency keys on the REST write endpoints now
that third parties can call them.

The AI assistant hands a model a caller with full read **and write** access to the
account. Keep it off, or gate it to read-only tools before anyone else can reach it.

### 2.4 The cold start

Sign up today and you get: no accounts, no categories, no tags, no budget, no
salary components, empty tables, a sidebar of ten screens with no indication of
where to begin, and a statements table whose category field is a free-text
autocomplete over nothing.

Minimum viable first-run:
- An onboarding flow: name your accounts and opening balances, pick a currency and
  financial-year start, connect the Android app or skip, seed a category set.
- **A default category taxonomy**, seeded per user (see §4.2).
- Real empty states on every screen — one sentence on what the screen is for and
  the one action that fills it.
- A demo/sample account someone can tour before entering anything.
- The `_help` pattern already in `budget/_help/` extended to every screen.

### 2.5 Sign-in that people will actually use

Today: email/password (with mandatory verification) and **GitHub**. GitHub is a
sign that this was built for its author. Add Google and Apple sign-in; for
India, consider phone/OTP. Keep passkeys — they're a genuine differentiator.

### 2.6 Transactional email

`src/emails/` contains exactly one template, `reset-password.tsx`, and it is used
for password reset, email verification **and** 2FA OTP delivery — so a user
verifying their address receives an email that says "reset your password". Needs:
separate templates for verification, OTP, welcome, invitation (for friend
linking), and later digests and alerts. Plus SES production access, DKIM/SPF/DMARC,
bounce and complaint handling, and an unsubscribe path.

### 2.7 Legal and store compliance

- **India's DPDP Act** applies the moment you process other people's personal
  data: consent notice, purpose limitation, a grievance officer, breach
  notification, retention limits, and data-portability (an export endpoint —
  which you also want as a product feature). The existing `/privacy` and `/terms`
  need a lawyer's pass, not a template's.
- **Play Store `READ_SMS` / `RECEIVE_SMS`.** The manifest requests both. These
  are restricted permissions and Google's SMS/Call Log policy allows them only
  for enumerated use cases with an approved declaration; Indian finance apps have
  repeatedly been removed over exactly this. **Verify against current policy
  before you rely on it**, and build a fallback now:
  `NotificationListenerService` reading bank notifications instead of SMS, which
  sits under a different (also sensitive, but differently scoped) policy. Losing
  SMS capture with no fallback removes the app's best feature.
- The Android manifest also still has AppAuth's sample intent filter for
  `appauth.demo-app.io` (the real scheme is `expense-tracker` via
  `appAuthRedirectScheme`). Dead config claiming an App Link on a domain you
  don't own. Delete it.
- No `manifest.webmanifest`, `robots.txt`, `sitemap.xml` or app icons — `public/`
  contains only `brand/`. The proxy already allows these paths; the files don't exist.

### 2.8 Support and operations

- An admin console that can, with an audit trail: find a user, see their counts
  and last activity, read their error log, impersonate read-only, and export or
  delete their data on request.
- Per-user error attribution in the existing OTel setup, and an alert when a
  user hits repeated 500s.
- A status page and a documented incident process. People's money data raises the
  bar on "it'll be fine".

---

## 3. Feature gaps against the market

Grouped by the question a user is asking. The "who has it" column names apps a
prospective user is likely comparing against.

### 3.1 Getting data in — the decisive battleground

| Gap | Who has it |
|---|---|
| **Bank statement import** — per-bank CSV/XLS/PDF with saved column mappings | Firefly III, Actual, every Indian app |
| **Account Aggregator (RBI) consent-based fetch** | INDmoney, Money View, Axio, Jupiter |
| **Email parsing** — Gmail/OAuth read of bank and card alerts | Walnut (historically), Monarch via partners |
| **Receipt scan / OCR** | Wallet by BudgetBakers, Money Manager, Expensify |
| **Notification listener** as an SMS alternative | Most current Indian apps |
| **iOS — nothing at all** | Everyone |
| **Duplicate detection** on import and SMS capture | All of them |
| **Quick-add that is genuinely quick** — widget, share-sheet, shortcut, voice | Money Manager, Splitwise |
| Open Banking (UK/EU) / Plaid (US) | YNAB, Monarch, Rocket Money |

The **Account Aggregator** path is the single biggest India unlock — consent-based
statement fetch, no SMS permission, no parser maintenance. It requires being a
Financial Information User, which in practice means going through a TSP (Finvu,
Setu, Perfios) and clearing their onboarding. That is a months-long commercial and
compliance track, not an engineering task. Start the conversation early if you
intend to be serious about India; it is also a moat once you have it.

**iOS is the biggest raw-reach gap.** iOS has no SMS read access at all, so the
capture strategy there must be import + AA + manual + share-sheet. Design the
capture layer so SMS is one adapter among several, not the foundation.

### 3.2 The transaction record itself

The `statements` row is `amount, category, tags[], accountId, friendId, kind,
createdAt, additionalAttributes`. What's missing is conspicuous:

- **No description / note / merchant / payee field.** This is the most-used field
  in every competing app. `category` is doing the work of all four, which is why
  categories are free text — they have to carry the detail. This one change
  cascades through search, auto-categorisation, duplicate detection and insights.
- **No attachments.** No receipt, no invoice, no warranty. Needs S3 + signed URLs.
- **No currency on the row.** Hardcoded INR everywhere.
- **No `excluded_from_reports` flag** — for reimbursements, internal moves, noise.
- **No cleared / pending state**, so reconciliation is a report rather than a workflow.
- **No split of one transaction across categories** (a ₹4,000 supermarket bill is
  groceries + household + a gift).
- **No refund / reversal linkage.**
- **Transfers are a separate table.** `selfTransferStatements` means every query,
  every type (`Statement | SelfTransferStatement`), every merge helper and every
  UI component carries a union. Transfers are not conceptually different from a
  two-legged statement, and the split costs you something on every feature you
  add. See §5.2.

### 3.3 Categorisation

Categories are `text` on `statements`, discovered by `SELECT DISTINCT`. There is
no categories table. So: no icons, no colours, no parent/child hierarchy, no
rename (you'd have to UPDATE every row), no merge, no per-category budget without
going through a jsonb rule, no defaults, no ordering, and no auto-categorisation.

Every competing app has a seeded hierarchy with icons and a rules engine
("merchant contains SWIGGY → Food → Dining"). Firefly III's rule engine is the
reference implementation; Monarch's merchant-memory ("you always categorise this
payee this way") is the version users actually notice.

### 3.4 Finding things

`statementParserSchema` filters on date, account, category, tags, kind, and sorts
by date/amount/category. There is **no text search** (nothing to search — see
§3.2) and no amount range, no "uncategorised only", no saved views. Users search
for "that restaurant in June" constantly.

Also no **CSV/Excel export**. `papaparse` is imported for import only. Export is
both a feature users demand and a portability obligation under DPDP.

### 3.5 Budgeting

The waterfall is more expressive than YNAB's envelopes and considerably more than
Mint-style caps. It is also the single hardest thing in the app to explain, and
it requires the user to construct jsonb rules.

What a general audience needs alongside it:
- **Templates** — 50/30/20, zero-based, "just cap my top five categories" — so a
  first budget takes two minutes.
- **A visual rule builder.** The rule is already a structured jsonb document
  (`budget-rules.ts`); a picker over categories/tags/accounts/kinds is a UI task,
  not a model change.
- **Per-category monthly budgets with rollover** (YNAB's core loop), which the
  waterfall can express but doesn't surface.
- **Alerts at 50/80/100%** and mid-month pacing ("you're 70% through the month and
  80% through dining").
- **Simple mode / advanced mode.** Do not make everyone meet the waterfall on day one.

### 3.6 Goals — entirely absent

No savings goals, no emergency fund, no debt-payoff plan, no target dates, no
progress. This is table stakes: YNAB targets, Monarch goals, Firefly's piggy
banks, and goal-based investing in every Indian investment app. The
`earmarked` allocation kind is the closest thing you have and it is a budget
mechanism, not a goal.

Debt payoff specifically — snowball vs avalanche, with your amortisation engine
behind it — would be a strong feature. You already compute everything needed.

### 3.7 Net worth and liabilities

You hold assets (`investments`), cash (`bankAccount`), and card debt
(`creditCardAccounts` + `emis`). What's missing:

- **A net-worth-over-time view.** The headline number in Monarch, INDmoney,
  Kuvera. You have every input and show it nowhere.
- **A loans table.** `emis.creditId` is NOT NULL against `creditCardAccounts`,
  so a home loan, car loan, education loan or personal loan cannot be entered.
  For an Indian audience the home loan is usually the largest single line in
  their financial life. See §4.1.
- Non-market assets: property, vehicle, gold, with periodic valuation.

### 3.8 Investments

Strong coverage of instruments and live pricing. Missing the analysis layer:

- **XIRR / CAGR** per holding and per portfolio (you have dated cashflows).
- **SIP tracking** — scheduled recurring investments, not one-off rows.
- **Dividends, interest payouts, bonuses, splits, corporate actions.**
- **Capital gains reporting** — STCG/LTCG with grandfathering, the thing every
  Indian investor needs each July and no free tool does well.
- **Asset allocation targets and rebalancing.**
- Missing instruments: NPS, PPF, SGB, REITs/InvITs, bonds, ESPP, insurance (ULIP,
  term, health).
- **Broker import** — Zerodha/Groww/MF Central statements; CAS parsing.

### 3.9 Income beyond a salary

The salary model is the most impressive thing here and also the narrowest. Nothing
represents: freelance/contract income, multiple employers, variable or
commission-based pay, business revenue, rent received, or a partner's income. A
freelancer wants invoices, expected-vs-received, GST, and advance-tax estimates;
none of that exists.

Minimum: an **income source** abstraction where "salary with components and
revisions" is one kind among several, with a simple "expected amount on a
schedule" kind for everyone else.

### 3.10 Splitting — against Splitwise

The linking branch is a strong foundation and better-designed than Splitwise's
model in one respect (the inbox, which correctly recognises that a transfer
between two people has two readings). Still missing:

| Gap | Note |
|---|---|
| **Groups** | The organising unit in Splitwise — trip, flat, household. Splits here are per-statement only. |
| **Multiple payers** on one expense | Common at dinners |
| **Shares and adjustment splits** | You have exact amounts and percentages; not "2 shares vs 1" or "+₹200 for his drink" |
| **Itemised bill splitting** | Splitwise Pro, and the feature people screenshot |
| **Settle-up as a first-class act** | Today it's a two-leg manual pattern. Needs a record, a method, and a **UPI deep link** — which beats Splitwise outright in India |
| **Debt simplification** across a group | Splitwise's signature |
| **Recurring shared expenses** | Rent, utilities, subscriptions |
| **Reminders** | "Nudge" — and in India, a WhatsApp nudge (cf. Khatabook/OkCredit) |
| **Comments and an activity feed** | Where the social trust lives |
| **Multi-currency splits** | Trips abroad |
| **Receipt attached to a split** | Proof |

Splitwise is the most likely way a stranger arrives at this app. It is worth
treating that funnel deliberately: a Splitwise CSV importer, and a free split
experience good enough to stand alone, with the ledger as the upsell.

### 3.11 Collaboration

- **Households / couples** — the most-requested feature in personal finance
  software and Monarch's main wedge. Joint accounts and a shared budget, with
  personal spending still private. Architecturally the biggest ask here: it means
  data scoped to a household, not a user ID, which touches every query.
- **Read-only sharing** with a CA/accountant or a parent.
- Dependents and family members whose spending you fund.

### 3.12 Notifications — none exist

There is no notification system of any kind. The Android app holds
`POST_NOTIFICATIONS` and an `AppNotificationManager` but nothing server-driven.
Needed: bill due, budget threshold crossed, salary credited, unreviewed SMS
piling up, friend invitation, settle-up nudge, unusual transaction, weekly and
monthly digest emails. This is also the main retention mechanism in the category
— an app nobody is reminded to open is an app nobody opens.

Requires the job runner from §5.1.

### 3.13 Intelligence and insights

- **Subscription detection** — find recurring charges automatically, flag price
  increases, flag unused. This is Rocket Money's entire business and your
  `recurringPayments` + schedule-matching code is 70% of the way there.
- **Anomaly detection** — "this is 3× your usual at this merchant".
- **Cashflow forecast** — you have salary schedules, EMI schedules and recurring
  payments. "Will I make it to payday" is computable today and shown nowhere.
- **An insights feed** — month-over-month movement, biggest changes, new merchants.
- **Year in review.** Shareable, and a growth loop.

Your AI assistant is better positioned for this than most, because it has typed
tool access to a well-modelled ledger. But it should be read-only and
insight-shaped, not a write surface.

### 3.14 Multi-currency and localisation

- Currency per account and per transaction; FX at transaction date (the
  machinery exists in `investment/fx.ts` — generalise it); a display currency.
- `formatDate` hardcodes `'en-US'`; `formatCurrency` defaults to INR/en-IN.
- Indian digit grouping (lakh/crore) vs Western grouping, as a user preference.
- Financial-year start is assumed April; week start, first day of month, and
  date format all need to be settings.
- Tax is new-regime India only. Either make the tax module pluggable by
  jurisdiction or scope it explicitly as an India feature and hide it elsewhere.
- No i18n framework at all. Decide now whether you ever want one; retrofitting is
  far more expensive.

### 3.15 Platform

- **No iOS.** See §3.1.
- **No PWA** — no manifest, no service worker, no offline, no installability.
  Cheapest meaningful reach you can buy.
- The Android app is read-mostly: statements list, summary, investments, settings,
  two widgets, one create dialog. Needs full CRUD, offline queueing, biometric
  lock, and the quick-capture surfaces.
- No app lock / biometric gate on the web app either, which people expect of a
  finance app on a shared laptop.

---

## 4. What exists but is too narrow

Cheaper than new features and higher leverage, because the hard part is done.

### 4.1 EMIs → loans *(highest value in this section)*

Make the lender polymorphic instead of `creditCardAccounts`-only: a `loans` table
with a type (home, car, education, personal, card EMI, gold, BNPL), a lender, a
disbursal date, and a linked account for the debit. Then add what loans need and
card EMIs don't: **prepayment** (with the recalculation choice — reduce EMI or
reduce tenure), **floating rates** with a reset history, moratorium, and
foreclosure. The amortisation engine (`emi-calculations.ts`, well tested) already
handles the maths. This single change makes the app usable by a large population
it currently can't serve at all.

### 4.2 Accounts

`bankAccount` is `{ accountName, startingBalance }`. Add: type (savings, current,
cash, wallet, credit card, loan, investment), currency, institution (with a logo),
last-4, archived flag, display order, colour/icon, and an exclude-from-net-worth
flag. Make `creditCardAccounts` a specialisation rather than a side table.

Also: `startingBalance` is a single opening figure. Add dated **balance
checkpoints** so reconciliation becomes "the balance on 1 Sep was X, and
everything since agrees" rather than a single anchor at the beginning of time.

### 4.3 Categories as entities

A `categories` table: name, parent, icon, colour, kind (expense/income/transfer),
archived, position, per-user, seeded from a default set on signup. Migrate the
free-text column to a foreign key with a backfill. Then rename, merge, hierarchy,
per-category budgets and auto-categorisation all become possible. This is the
highest-leverage schema change after §3.2's description field.

### 4.4 Tax

Regime choice (old/new), 80C/80D/HRA/home-loan-interest, multiple financial years
side by side, capital gains, advance-tax schedule, and a Form-16 reconciliation
report. The per-payment component snapshots in `salaryPaymentComponents` make this
tractable — the data is already there.

### 4.5 Recurring payments should post themselves

Today they are forecast plus manual settle-detection. With a job runner, generate
the statement on its due date in a pending state for one-tap confirmation. Same
for SIPs and EMI instalments.

### 4.6 Report templates → a gallery

The per-user template model with a sandboxed code step is a real differentiator and
nobody will ever write one from scratch. Ship a gallery of starting templates
(monthly review, annual summary, tax pack, net-worth statement, trip report),
a one-click clone, and later sharing. The AI assistant generating a template from
a description is a genuinely novel feature and the `@helix-hq/pdf-report/ai`
entrypoint suggests you were already thinking about it.

### 4.7 SMS capture → a capture pipeline

Make SMS one adapter. Add notification-listener, email, import-file and AA
adapters behind the same `ParsedTransaction` → review-queue contract. The ~90
parsers are an asset; also a maintenance burden that grows with every bank's
template change. Consider a model-assisted fallback for unmatched messages that
proposes a parse for review, and telemetry on parse failure rates per sender so
you know what's breaking before users tell you.

### 4.8 Admin → support console

See §2.8.

---

## 5. Architecture work that unblocks the rest

1. **Connection pooling.** §2.1. Everything waits on this.
2. **Collapse `selfTransferStatements` into `statements`.** A transfer becomes a
   statement with a counter-account, or two legs sharing a transfer ID. This
   deletes the `Statement | SelfTransferStatement` union from the types, the merge
   helpers, the table columns, the editable cells and every future feature that
   would otherwise need to handle both. Do it before the surface area grows
   further. Consider whether full double-entry is worth it — Firefly III's
   experience says yes for correctness, but it is a large migration and your check
   constraints already enforce most of the same invariants.
3. **A background job runner.** Inngest, QStash, or Vercel cron plus a queue
   table. Unblocks: recurring posting, price refresh and caching, notifications,
   digests, AA sync, subscription detection, report delivery. Nothing in §3.12,
   §3.13 or §4.5 is possible without it.
4. **Money as a type.** Amounts are `numeric` read as strings and parsed with
   `parseFloatSafe`. Move to integer minor units plus a currency code, with
   Decimal.js at the edges. Do it with the multi-currency work, not separately.
5. **A `userSettings` table.** Currency, locale, timezone (currently a cookie),
   financial-year start, week start, number format, date format, theme, feature
   opt-ins. Many features above need a home for preferences and there is none.
6. **Caching.** `REDIS_URL` is declared and unused. Market data is fetched
   per-request from Yahoo and CoinGecko — this will rate-limit you with real
   traffic, and the price of a security is the same for all users. Cache
   instrument prices globally, FX daily.
7. **An audit log.** Needed for friend mirroring (who changed what, on whose
   side), for support, for collaboration, and for the trust story.
8. **Soft deletes.** "I deleted a year of statements" is unrecoverable today.
9. **Test strategy.** Router-level integration tests against a real Postgres,
   the isolation suite from §2.2, and E2E on the critical flows (signup →
   onboarding → first transaction; SMS review → insert; split → settle). 131 unit
   tests over pure functions is a good base and covers none of the paths that can
   leak another person's data.
10. **Data export / import.** Full-account JSON and CSV export. Obligation and feature.

---

## 6. Sequencing

Deliberately not estimated in hours — the point is the order.

**Phase 0 — Make it safe to have users** *(nothing ships until this is done)*
Pooling · isolation tests · rate limiting · AI assistant read-only or off ·
email templates · Google/Apple sign-in · onboarding + seeded categories + empty
states · data export · DPDP review · SMS-policy verification + notification-listener
fallback · admin support console · manifest/robots/icons.

**Phase 1 — Make it usable by someone else** *(the assumptions in §1.2)*
Finish friend linking and ship its UI · description/merchant field + text search ·
categories as entities with a seeded hierarchy + auto-categorisation rules ·
loans (not just card EMIs) · account types and currency · notifications and
digests on the new job runner · budget simple-mode and the visual rule builder ·
net-worth view · CSV export · PWA.

**Phase 2 — Compete**
Groups, settle-up with UPI deep links, debt simplification, reminders · bank
statement import with saved mappings · receipt attachments and OCR · goals and
debt payoff · subscription detection and cashflow forecast · XIRR, SIPs, capital
gains · recurring auto-posting · report template gallery.

**Phase 3 — Reach and moat**
iOS · Account Aggregator · households and shared budgets · multi-currency ·
broker and CAS import · AI insights and template generation · i18n ·
public API and integrations.

---

## 7. Positioning — the decision that determines all of the above

The feature list changes completely depending on which of these you are building.
My recommendation is **C**.

**A. A consumer expense tracker for everyone.**
You compete with well-funded apps on auto-capture, polish and onboarding, and
most of your best work (salary modelling, the budget waterfall, PDF templates)
is irrelevant to that fight. Requires nearly everything above. Weakest position.

**B. A Splitwise competitor with a real ledger behind it.**
The linking branch is genuinely well designed and Splitwise is widely disliked
and barely maintained. Narrow, winnable, and gives you a viral loop — every
invitation is a signup. But it means prioritising groups, settle-up and
reminders over the modelling you've invested most in, and the ledger becomes
the upsell rather than the product.

**C. ⭐ A precision ledger for people who want to understand their money properly.**
The salaried Indian professional with a card, EMIs, RSUs, EPFO, a salary
structure they want modelled, and the willingness to spend ten minutes a week
getting it right. Nobody serves this person well — Indian apps are
auto-categorisation toys, YNAB and Monarch don't understand Indian payroll or
tax, and Firefly III has no capture story and a brutal UI. Your existing work is
*already* the product; the gap is onboarding, loans, categories, collaboration
and reach. You would charge for this, and the people who want it will pay.
Phase 0 + Phase 1 is roughly a complete product under this positioning.

**D. Open-source self-hosted, Firefly III's successor.**
It's MIT already, the stack is modern, the modelling is better. Costs you nothing
in features — the gaps are mostly hosting and multi-tenancy, which self-hosters
don't need. Earns contributors rather than revenue. Worth considering *alongside*
C as a distribution strategy, not instead of it.

### What to deliberately not build
Credit-score monitoring. Bill negotiation. Investment advice or recommendations
(regulated). Lending or BNPL. Crypto trading. A social feed. Under positioning C,
also skip: gamification, badges, and anything that makes the app cute. Your users
chose it because it is exact.

---

## 8. The honest summary

You have built something unusually good and unusually specific. The depth —
salary revisions with pro-rating, a budget waterfall with first-match claiming,
amortisation down to IAFE and GST, sandboxed per-user report templates, a
reconciliation that lands on ₹0.00 — is not what's missing.

What's missing is everything *between* a stranger and that depth: a way in, a
first five minutes, data that arrives without being typed, categories that exist
before you invent them, a loan that isn't on a credit card, a notification that
brings them back, and a database that can hold more than one of them at a time.

Three things, if you only do three: **fix the connection pool**, **write the
multi-tenant isolation tests**, and **build the first-run experience**. Without
the first you cannot have users; without the second you should not; without the
third they will not stay.
