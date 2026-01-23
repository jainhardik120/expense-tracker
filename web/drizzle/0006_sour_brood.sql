ALTER TABLE "friend_transactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "friend_transactions" CASCADE;--> statement-breakpoint
ALTER TABLE "statements" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "friend_id" uuid;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_friend_id_friends_profiles_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."friends_profiles"("id") ON DELETE cascade ON UPDATE no action;