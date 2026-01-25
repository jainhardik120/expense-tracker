CREATE TYPE "public"."sms_transaction_type" AS ENUM('income', 'expense', 'credit', 'transfer', 'investment');--> statement-breakpoint
CREATE TABLE "sms_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric NOT NULL,
	"type" "sms_transaction_type" NOT NULL,
	"merchant" text,
	"reference" text,
	"account_last_4" text,
	"sms_body" text NOT NULL,
	"sender" text NOT NULL,
	"timestamp" timestamp NOT NULL,
	"bank_name" text NOT NULL,
	"is_from_card" text DEFAULT 'false' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"from_account" text,
	"to_account" text
);
--> statement-breakpoint
ALTER TABLE "sms_notifications" ADD CONSTRAINT "sms_notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;