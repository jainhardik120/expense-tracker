CREATE TYPE "public"."sms_transaction_status" AS ENUM('pending', 'inserted', 'junked');--> statement-breakpoint
ALTER TABLE "sms_notifications" ADD COLUMN "status" "sms_transaction_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "sms_notifications" ADD COLUMN "additional_attributes" jsonb DEFAULT '{}' NOT NULL;