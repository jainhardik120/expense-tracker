CREATE TABLE "friend_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"friend_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "splits" DROP CONSTRAINT "splits_statement_id_statements_id_fk";
--> statement-breakpoint
ALTER TABLE "friend_transactions" ADD CONSTRAINT "friend_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_transactions" ADD CONSTRAINT "friend_transactions_friend_id_friends_profiles_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."friends_profiles"("id") ON DELETE cascade ON UPDATE no action;