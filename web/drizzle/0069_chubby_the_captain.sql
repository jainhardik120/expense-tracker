CREATE TABLE "epfo_interest_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"instrument_code" text NOT NULL,
	"financial_year_start" integer NOT NULL,
	"amount" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "salary_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "epfo_interest_credits" ADD CONSTRAINT "epfo_interest_credits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "epfo_interest_credits_account_year_idx" ON "epfo_interest_credits" USING btree ("user_id","instrument_code","financial_year_start");--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_salary_payment_id_salary_payments_id_fk" FOREIGN KEY ("salary_payment_id") REFERENCES "public"."salary_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_salary_payment_id_unique" UNIQUE("salary_payment_id");