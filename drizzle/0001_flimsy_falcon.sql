CREATE TYPE "public"."statement_kinds" AS ENUM('expense', 'outside_transaction', 'self_transfer', 'friend_transaction');--> statement-breakpoint
CREATE TABLE "bank_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"starting_balance" numeric NOT NULL,
	"account_name" text NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "friends_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "self_transfer_statements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"from_account_id" text NOT NULL,
	"to_account_id" text NOT NULL,
	"amount" numeric NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "splits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"statement_id" text NOT NULL,
	"amount" numeric NOT NULL,
	"friend_id" text,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"amount" numeric NOT NULL,
	"category" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"statementKind" "statement_kinds" DEFAULT 'expense',
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD CONSTRAINT "friends_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_transfer_statements" ADD CONSTRAINT "self_transfer_statements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_transfer_statements" ADD CONSTRAINT "self_transfer_statements_from_account_id_bank_account_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_transfer_statements" ADD CONSTRAINT "self_transfer_statements_to_account_id_bank_account_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_friend_id_friends_profiles_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."friends_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_account_id_bank_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;