CREATE TYPE "public"."friend_invitation_status" AS ENUM('pending', 'accepted', 'declined', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."friend_statement_inbox_status" AS ENUM('pending', 'accepted', 'dismissed');--> statement-breakpoint
CREATE TABLE "friend_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_user_id" text NOT NULL,
	"friend_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" "friend_invitation_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_statement_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_statement_id" uuid NOT NULL,
	"origin_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	"friend_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"category" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"status" "friend_statement_inbox_status" DEFAULT 'pending' NOT NULL,
	"resolved_statement_id" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD COLUMN "linked_user_id" text;--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD COLUMN "linked_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD COLUMN "linked_at" timestamp;--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "mirror_of_split_id" uuid;--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "mirror_of_statement_id" uuid;--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "category_overridden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "friend_invitations" ADD CONSTRAINT "friend_invitations_inviter_user_id_user_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_invitations" ADD CONSTRAINT "friend_invitations_friend_id_friends_profiles_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."friends_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_statement_inbox" ADD CONSTRAINT "friend_statement_inbox_origin_statement_id_statements_id_fk" FOREIGN KEY ("origin_statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_statement_inbox" ADD CONSTRAINT "friend_statement_inbox_origin_user_id_user_id_fk" FOREIGN KEY ("origin_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_statement_inbox" ADD CONSTRAINT "friend_statement_inbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_statement_inbox" ADD CONSTRAINT "friend_statement_inbox_friend_id_friends_profiles_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."friends_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_statement_inbox" ADD CONSTRAINT "friend_statement_inbox_resolved_statement_id_statements_id_fk" FOREIGN KEY ("resolved_statement_id") REFERENCES "public"."statements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_invitations_pending_friend_idx" ON "friend_invitations" USING btree ("friend_id") WHERE "friend_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "friend_invitations_email_status_idx" ON "friend_invitations" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "friend_invitations_inviter_idx" ON "friend_invitations" USING btree ("inviter_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_statement_inbox_origin_idx" ON "friend_statement_inbox" USING btree ("origin_statement_id","user_id");--> statement-breakpoint
CREATE INDEX "friend_statement_inbox_user_status_idx" ON "friend_statement_inbox" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "friend_statement_inbox_resolved_idx" ON "friend_statement_inbox" USING btree ("resolved_statement_id") WHERE "friend_statement_inbox"."resolved_statement_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD CONSTRAINT "friends_profiles_linked_user_id_user_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD CONSTRAINT "friends_profiles_linked_profile_id_friends_profiles_id_fk" FOREIGN KEY ("linked_profile_id") REFERENCES "public"."friends_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_mirror_of_split_id_splits_id_fk" FOREIGN KEY ("mirror_of_split_id") REFERENCES "public"."splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_mirror_of_statement_id_statements_id_fk" FOREIGN KEY ("mirror_of_statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friends_profiles_linked_user_idx" ON "friends_profiles" USING btree ("linked_user_id") WHERE "friends_profiles"."linked_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "statements_mirror_of_split_idx" ON "statements" USING btree ("mirror_of_split_id") WHERE "statements"."mirror_of_split_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "statements_mirror_of_statement_idx" ON "statements" USING btree ("mirror_of_statement_id") WHERE "statements"."mirror_of_statement_id" IS NOT NULL;