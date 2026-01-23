ALTER TABLE "emis" ADD COLUMN "first_installment_date" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "emis" ADD COLUMN "processing_fees_date" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "emis" ADD COLUMN "iafe" numeric DEFAULT '0' NOT NULL;