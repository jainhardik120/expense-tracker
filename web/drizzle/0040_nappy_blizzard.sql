ALTER TABLE "investments" ADD COLUMN "stock_market" text;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "is_rsu" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "investments"
SET "stock_market" = 'IN'
WHERE "investment_kind" = 'stocks' AND "stock_market" IS NULL;
