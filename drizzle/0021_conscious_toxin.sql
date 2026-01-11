ALTER TABLE "emis" DROP CONSTRAINT "emis_credit_id_credit_card_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "emis" ADD CONSTRAINT "emis_credit_id_credit_card_accounts_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credit_card_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emis" DROP COLUMN "balance";