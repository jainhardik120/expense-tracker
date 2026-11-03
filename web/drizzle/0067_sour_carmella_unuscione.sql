CREATE TABLE "investment_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"investment_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "investment_payments_amount_check" CHECK ("investment_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "investment_payments" ADD CONSTRAINT "investment_payments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_payments" ADD CONSTRAINT "investment_payments_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_payments" ADD CONSTRAINT "investment_payments_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "investment_payments_pair_idx" ON "investment_payments" USING btree ("investment_id","statement_id");--> statement-breakpoint
CREATE INDEX "investment_payments_statement_idx" ON "investment_payments" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "investment_payments_user_idx" ON "investment_payments" USING btree ("user_id");