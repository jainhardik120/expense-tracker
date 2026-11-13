CREATE TABLE "account_interest_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"annual_rate" numeric NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "account_interest_rates_rate_check" CHECK ("account_interest_rates"."annual_rate" >= 0 AND "account_interest_rates"."annual_rate" < 100)
);
--> statement-breakpoint
ALTER TABLE "account_interest_rates" ADD CONSTRAINT "account_interest_rates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_interest_rates" ADD CONSTRAINT "account_interest_rates_account_id_bank_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_interest_rates_account_from_idx" ON "account_interest_rates" USING btree ("account_id","effective_from");--> statement-breakpoint
CREATE INDEX "account_interest_rates_user_idx" ON "account_interest_rates" USING btree ("user_id");