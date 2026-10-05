CREATE TYPE "public"."balance_check_source" AS ENUM('manual', 'statement_import');--> statement-breakpoint
CREATE TABLE "account_balance_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"checked_at" timestamp NOT NULL,
	"balance" numeric NOT NULL,
	"note" text,
	"source" "balance_check_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_balance_checks" ADD CONSTRAINT "account_balance_checks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balance_checks" ADD CONSTRAINT "account_balance_checks_account_id_bank_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_balance_checks_account_time_idx" ON "account_balance_checks" USING btree ("account_id","checked_at");--> statement-breakpoint
CREATE INDEX "account_balance_checks_user_idx" ON "account_balance_checks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "statements_account_created_idx" ON "statements" USING btree ("account_id","created_at") WHERE "statements"."account_id" IS NOT NULL;