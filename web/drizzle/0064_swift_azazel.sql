CREATE TABLE "mutual_fund_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheme_code" text NOT NULL,
	"company_name" text NOT NULL,
	"stock_ref" text,
	"sector" text,
	"asset_type" text,
	"instrument" text,
	"rating" text,
	"weight_percent" numeric NOT NULL,
	"market_value_crore" numeric
);
--> statement-breakpoint
CREATE TABLE "mutual_fund_schemes" (
	"scheme_code" text PRIMARY KEY NOT NULL,
	"provider_id" text,
	"scheme_name" text NOT NULL,
	"fund_house" text,
	"category" text,
	"sub_category" text,
	"expense_ratio" numeric,
	"aum_crore" numeric,
	"benchmark" text,
	"portfolio_turnover" numeric,
	"return_stats" jsonb,
	"portfolio_date" timestamp,
	"fetched_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_profiles" (
	"stock_ref" text PRIMARY KEY NOT NULL,
	"name" text,
	"industry" text,
	"market_cap_crore" numeric,
	"fetched_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mutual_fund_holdings" ADD CONSTRAINT "mutual_fund_holdings_scheme_code_mutual_fund_schemes_scheme_code_fk" FOREIGN KEY ("scheme_code") REFERENCES "public"."mutual_fund_schemes"("scheme_code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mutual_fund_holdings_scheme_idx" ON "mutual_fund_holdings" USING btree ("scheme_code");