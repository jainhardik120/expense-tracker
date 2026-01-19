ALTER TABLE "recurring_payments" ADD COLUMN "frequency_multiplier" numeric DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_payments" DROP COLUMN "is_active";