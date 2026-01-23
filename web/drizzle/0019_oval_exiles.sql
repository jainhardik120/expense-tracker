CREATE TABLE "credit_card_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"card_limit" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"credit_id" uuid NOT NULL,
	"principal" numeric NOT NULL,
	"tenure" numeric NOT NULL,
	"annual_interest_rate" numeric NOT NULL,
	"processing_fees" numeric NOT NULL,
	"processing_fees_gst" numeric NOT NULL,
	"gst" numeric NOT NULL,
	"balance" numeric NOT NULL,
	"created_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "additional_attributes" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_card_accounts" ADD CONSTRAINT "credit_card_accounts_account_id_bank_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emis" ADD CONSTRAINT "emis_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emis" ADD CONSTRAINT "emis_credit_id_credit_card_accounts_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credit_card_accounts"("id") ON DELETE cascade ON UPDATE no action;