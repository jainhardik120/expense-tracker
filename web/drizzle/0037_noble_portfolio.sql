ALTER TABLE "investments" ADD COLUMN "instrument_code" text;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "instrument_name" text;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "annual_rate" numeric;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "is_closed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
UPDATE "investments"
SET "investment_kind" = CASE
  WHEN lower("investment_kind") IN ('fd', 'fixed deposit', 'fixed_deposit', 'fixed deposits') THEN 'fd'
  WHEN lower("investment_kind") IN ('stock', 'stocks', 'equity', 'equities') THEN 'stocks'
  WHEN lower("investment_kind") IN ('mutual fund', 'mutual funds', 'mutual_funds', 'mf') THEN 'mutual_funds'
  WHEN lower("investment_kind") IN ('crypto', 'cryptocurrency', 'cryptocurrencies') THEN 'crypto'
  ELSE 'other'
END;
