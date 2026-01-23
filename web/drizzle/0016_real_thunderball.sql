CREATE TABLE "investments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"investment_kind" text NOT NULL,
	"investment_date" timestamp NOT NULL,
	"investment_amount" numeric NOT NULL,
	"maturity_date" timestamp,
	"maturity_amount" numeric,
	"amount" numeric,
	"units" numeric,
	"purchase_rate" numeric
);
--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;