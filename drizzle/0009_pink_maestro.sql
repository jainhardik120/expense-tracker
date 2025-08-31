ALTER TABLE "self_transfer_statements" DROP CONSTRAINT "self_transfer_statements_from_account_id_bank_account_id_fk";
--> statement-breakpoint
ALTER TABLE "self_transfer_statements" DROP CONSTRAINT "self_transfer_statements_to_account_id_bank_account_id_fk";
--> statement-breakpoint
ALTER TABLE "splits" DROP CONSTRAINT "splits_statement_id_statements_id_fk";
--> statement-breakpoint
ALTER TABLE "splits" DROP CONSTRAINT "splits_friend_id_friends_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "statements" DROP CONSTRAINT "statements_account_id_bank_account_id_fk";
--> statement-breakpoint
ALTER TABLE "statements" DROP CONSTRAINT "statements_friend_id_friends_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "self_transfer_statements" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "self_transfer_statements" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "splits" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "splits" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "self_transfer_statements" ADD CONSTRAINT "self_transfer_statements_from_account_id_bank_account_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."bank_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_transfer_statements" ADD CONSTRAINT "self_transfer_statements_to_account_id_bank_account_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."bank_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_friend_id_friends_profiles_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."friends_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_account_id_bank_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_friend_id_friends_profiles_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."friends_profiles"("id") ON DELETE no action ON UPDATE no action;