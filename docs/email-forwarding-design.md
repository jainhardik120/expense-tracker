# Email forwarding: bank alerts and statements into the ledger

Written 2026-10-05, against `master` at `2e3930e`.

## Goal

Bank and card emails are the best automatic source we don't use yet. They cover
credit cards (which SMS covers poorly), carry available limits and balances, and
monthly e-statements carry an exact closing balance. We want them flowing into
the app without asking users for mailbox access.

## Decision: forwarding, not mailbox access

Each user gets a private address. They add one mail filter in Gmail or Outlook
that forwards bank senders to it. The app never sees the mailbox.

Options considered:

| Option | Access we get | Verdict |
| --- | --- | --- |
| **Per-user forwarding address** | Only what the user's filter forwards | **Chosen** |
| Apps Script in the user's Google account | Only what the script picks; code visible to the user | Power-user fallback, too fiddly for most |
| Gmail OAuth (`gmail.readonly`) | Entire mailbox; Gmail has no per-sender scope | No. Restricted scope means a yearly third-party security assessment for a public app, and a token leak exposes whole inboxes |
| IMAP with an app password | Entire mailbox plus stored credentials | Never |

Why users can trust forwarding:

- No password, no OAuth grant. Nothing to revoke but a filter they own.
- They decide exactly which senders are forwarded, and can read the filter.
- They can stop it instantly by deleting the filter, or rotate the address in
  the app.
- The app shows a log of every email received and what was extracted, and keeps
  no raw email after processing.

## Infrastructure: Amazon SES receiving

We already send mail with SES in `ap-south-1`. SES also *receives* mail in
`ap-south-1` (inbound endpoint `inbound-smtp.ap-south-1.amazonaws.com`), so this
needs no new vendor and stays in the same region and account.

### Flow

```
Bank ──email──▶ user's Gmail ──filter: forward──▶ <token>@inbox.hardikja.in
                                                        │  MX
                                                        ▼
                                          SES receipt rule (ap-south-1)
                                                        │
                                  1. S3 action: raw MIME → s3://…/inbound/<messageId>
                                  2. SNS notification (metadata + verdicts + S3 key)
                                                        │  HTTPS
                                                        ▼
                                  POST /api/inbound/ses (Next.js on Vercel)
                                     verify SNS signature → accept/reject →
                                     fetch MIME from S3 → parse → write → delete S3 object
```

Why S3 and not the SNS action alone: the SNS action only embeds the email body
up to **150 KB** and bounces anything larger. Statement PDFs are often bigger.
Writing to S3 and notifying via SNS handles any size and lets us delete the raw
email as soon as it has been processed.

No Lambda is needed. The SNS topic gets an HTTPS subscription pointing at the
app, so all logic stays in the Next.js codebase next to the parsers.

### What exists (set up 2026-10-05, account 425458867902, ap-south-1)

| Piece | Value |
| --- | --- |
| DNS (Cloudflare) | `inbox.hardikja.in MX 10 inbound-smtp.ap-south-1.amazonaws.com` |
| Active receipt rule set | `inbound` (the only active set in the account) |
| Rule | `expense-tracker-inbox`: recipients `inbox.hardikja.in`, TLS required, spam/virus scan, S3 action with SNS notify, then stop |
| Bucket | `expense-tracker-inbound-425458867902`, prefix `inbound/`, public access blocked, SSE-S3, objects expire after 1 day, `PutObject` only from that rule |
| SNS topic | `arn:aws:sns:ap-south-1:425458867902:et-inbound-email`, publish only from SES in this account; no subscription yet (added once `/api/inbound/ses` is deployed) |
| App IAM | inline policy `expense-tracker-inbound-read` on `hardik-blog-app`: `s3:GetObject`, `s3:DeleteObject` on `inbound/*` |

Verified with a test send from `no-reply@hardikja.in`: the message landed in
the bucket with spam and virus verdicts `PASS`.

### AWS setup (one time)

1. **Domain.** Use a subdomain so the root domain's mail is untouched:
   `inbox.hardikja.in`. Confirm the SES verified identity covers it (verify the
   subdomain explicitly if the existing identity is the address only).
2. **DNS.** Add `MX 10 inbound-smtp.ap-south-1.amazonaws.com` on
   `inbox.hardikja.in`.
3. **S3 bucket** in `ap-south-1`: public access blocked, SSE-S3 encryption,
   bucket policy allowing `ses.amazonaws.com` to `PutObject` for this account,
   and a lifecycle rule deleting objects under `inbound/` after 1 day as a
   backstop in case processing fails.
4. **SNS topic** `et-inbound-email` in `ap-south-1` with an HTTPS subscription
   to `https://expense-tracker.hardikja.in/api/inbound/ses`. The endpoint
   confirms the subscription by fetching the `SubscribeURL` it is sent once.
5. **Receipt rule set** (active) with one rule:
   - Recipients: `inbox.hardikja.in`.
   - Spam and virus scanning on.
   - Action 1: S3, prefix `inbound/`, notify the SNS topic.
   - Action 2: Stop rule set.
6. **IAM.** Add `s3:GetObject` and `s3:DeleteObject` on `inbound/*` to the
   credentials the app already uses for SES.

### Cost

Rates for `ap-south-1`, from the AWS price list API on 2026-10-05:

| Item | Rate |
| --- | --- |
| SES receiving, per email | $0.0001 ($0.10 per 1,000) |
| SES receiving, per 256 KB chunk | $0.00009 ($0.09 per 1,000) |
| S3 PUT | $0.005 per 1,000 |
| S3 GET | $0.004 per 10,000 |
| S3 Standard storage | $0.025 per GB-month (objects live minutes) |
| S3 data transfer out | first 100 GB/month free (global free tier), then $0.1093/GB |
| SNS | first 1M requests and first 100,000 HTTPS deliveries per month free |

Worked example for one person: 300 alert emails (one chunk each) and 10
statement emails (about four chunks each) a month.

| Item | Cost |
| --- | --- |
| SES: 310 emails | $0.031 |
| SES: 340 chunks | $0.031 |
| S3: 310 PUT, 310 GET | $0.0017 |
| S3 storage, data out, SNS | $0 (negligible or free tier) |
| **Total** | **≈ $0.064/month** |

That is about ₹5–6 a month, plus 18% GST if the account is billed through AWS
India. It scales linearly per active user. Mail sent to unknown addresses on
the domain (spam) is also billed per email, so the allowlist and token checks
don't change the SES charge, only what reaches the ledger.

## Security

An address can leak, and anyone can send mail to it. Every email must pass all
of these before anything reaches the ledger:

1. **SNS authenticity.** Verify the SNS message signature and that `TopicArn` is
   ours. Reject anything else outright.
2. **Recipient token.** The local part (`<token>@inbox…`) maps to exactly one
   active inbox row. Unknown or revoked token: drop.
3. **Sender allowlist.** The `From` domain must be on a curated list of bank and
   card domains, each tied to a parser.
4. **Authentication.** Require SES's `dkimVerdict` and `dmarcVerdict` to be
   `PASS`, and the passing DKIM signature's `d=` domain to align with the
   allowlisted sender domain. Gmail forwarding keeps the bank's original DKIM
   signature intact, so a genuine forwarded alert passes while a spoofed one
   cannot. SPF is expected to fail on forwarded mail (Gmail is the sending
   server) and is ignored. **This must be confirmed in the spike below.**
5. **Spam and virus verdicts** must be `PASS`.
6. **Idempotency.** SNS retries; key on the SES `messageId`.
7. **Rate limit** per inbox, to blunt a flood if a token leaks.

Anything rejected is logged (sender, subject, reason) with no body, and the S3
object is deleted immediately.

Data handling:

- Raw MIME exists only in S3, only until processed (minutes), with a 1-day
  lifecycle backstop.
- The database keeps the extracted result and a minimal log entry, never the
  email body.
- Statement PDF passwords: stored encrypted at rest per account, used only to
  open statements, and optional. Users who decline store nothing and upload
  statements by hand through the import flow.

## Gmail forwarding confirmation

Gmail won't forward to a new address until it has been confirmed. It sends an
email from `forwarding-noreply@google.com` containing a confirmation code and
link. The endpoint recognises that sender (DKIM-verified `google.com`), extracts
the code, and shows it in the app's setup screen so the user can paste it into
Gmail. We don't follow the link automatically; the user stays in control.
Outlook forwarding rules need no confirmation.

## Data model

```
email_inboxes
  id, user_id, token (unique, random, ≥ 20 chars), created_at, revoked_at,
  forwarding_confirmation_code (nullable), confirmation_received_at

inbound_emails
  id, user_id, inbox_id, ses_message_id (unique), received_at,
  from_address, from_domain, subject,
  dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict,
  status: accepted | rejected | parsed | failed,
  reject_reason (nullable), parser (nullable),
  extracted (jsonb: transactions / balance / statement summary)
```

Rotating an address creates a new `email_inboxes` row and revokes the old one.
"Disconnect" revokes the inbox and deletes its `inbound_emails` rows.

## Parsing and where results go

- Route by sender domain to a parser in the same registry the PDF/Excel
  statement import uses, so a bank's email alert parser and statement parser
  live together.
- **Transaction alerts** become pending items in the existing review queue (the
  SMS notifications inbox) with `source = email`, so they get the same
  dedupe against SMS, hints, and add-or-junk flow. An alert and an SMS for the
  same transaction must merge, not double up.
- **Balance or available limit** in an alert becomes an automatic balance check
  for the matched account (matched by account or card last digits).
- **E-statement attachments** go through the statement import with the stored
  password, producing a closing balance check and a reconciliation preview,
  never silent inserts.

## User-facing setup

Settings → Email forwarding:

1. Show the user's address with a copy button.
2. Show the exact Gmail search to turn into a filter
   (`from:(alerts@… OR …)`), built from the allowlist for the banks they have
   accounts with, plus steps: Create filter → Forward to → this address.
3. Show the Gmail confirmation code once it arrives.
4. Show the "Emails received" log: time, sender, subject, outcome, and what was
   extracted.
5. Buttons: rotate address, disconnect.
6. A plain "What we read and keep" panel.

## Work plan

1. **Spike (half a day).** Set up SES receiving on `inbox.hardikja.in`, forward
   one real alert from each bank you use, and confirm: delivery, the DKIM and
   DMARC verdicts on forwarded mail, the confirmation email format, and the
   real sender addresses for the allowlist.
2. **Endpoint and security layer**: SNS verification, token lookup, allowlist,
   verdict checks, S3 fetch and delete, log table.
3. **Settings screen**: address, filter instructions, confirmation code, log,
   rotate and disconnect.
4. **Alert parsers** per bank feeding the review queue and balance checks.
5. **Statement attachments** via the import parsers, with optional encrypted
   passwords.

## Open questions

- Do SES's DKIM and DMARC verdicts come back `PASS` for Gmail-forwarded bank
  mail? The security design depends on it; the spike answers it.
- Exact sender addresses for each bank and card, to be collected from real
  emails during the spike.
- Whether to keep a short-lived encrypted copy of failed emails for re-parsing
  after a parser fix, or always discard.
