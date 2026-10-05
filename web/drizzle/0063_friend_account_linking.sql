CREATE TYPE "public"."friend_invitation_status" AS ENUM('pending', 'accepted', 'declined', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."shared_answer_status" AS ENUM('accepted', 'dismissed');--> statement-breakpoint
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
CREATE TABLE "shared_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viewer_user_id" text NOT NULL,
	"split_id" uuid,
	"statement_id" uuid,
	"status" "shared_answer_status",
	"account_id" uuid,
	"as_kind" "statement_kinds",
	"category" text,
	"tags" text[],
	"answered_at" timestamp,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "shared_answers_one_source" CHECK (num_nonnulls("shared_answers"."split_id", "shared_answers"."statement_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD COLUMN "linked_user_id" text;--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD COLUMN "linked_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD COLUMN "linked_at" timestamp;--> statement-breakpoint
ALTER TABLE "friend_invitations" ADD CONSTRAINT "friend_invitations_inviter_user_id_user_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_invitations" ADD CONSTRAINT "friend_invitations_friend_id_friends_profiles_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."friends_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_answers" ADD CONSTRAINT "shared_answers_viewer_user_id_user_id_fk" FOREIGN KEY ("viewer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_answers" ADD CONSTRAINT "shared_answers_split_id_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_answers" ADD CONSTRAINT "shared_answers_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_answers" ADD CONSTRAINT "shared_answers_account_id_bank_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_invitations_pending_friend_idx" ON "friend_invitations" USING btree ("friend_id") WHERE "friend_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "friend_invitations_email_status_idx" ON "friend_invitations" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "friend_invitations_inviter_idx" ON "friend_invitations" USING btree ("inviter_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_answers_split_idx" ON "shared_answers" USING btree ("split_id","viewer_user_id") WHERE "shared_answers"."split_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shared_answers_statement_idx" ON "shared_answers" USING btree ("statement_id","viewer_user_id") WHERE "shared_answers"."statement_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shared_answers_viewer_idx" ON "shared_answers" USING btree ("viewer_user_id");--> statement-breakpoint
CREATE INDEX "shared_answers_account_idx" ON "shared_answers" USING btree ("account_id") WHERE "shared_answers"."account_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD CONSTRAINT "friends_profiles_linked_user_id_user_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends_profiles" ADD CONSTRAINT "friends_profiles_linked_profile_id_friends_profiles_id_fk" FOREIGN KEY ("linked_profile_id") REFERENCES "public"."friends_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friends_profiles_linked_user_idx" ON "friends_profiles" USING btree ("linked_user_id") WHERE "friends_profiles"."linked_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "splits_friend_idx" ON "splits" USING btree ("friend_id");--> statement-breakpoint
CREATE INDEX "statements_friend_idx" ON "statements" USING btree ("friend_id") WHERE "statements"."friend_id" IS NOT NULL;--> statement-breakpoint
CREATE VIEW "visible_statements" AS
SELECT s.id, s.user_id, s.account_id, s.friend_id, s.amount, s.category, s.tags,
       s."statementKind", s.taxable_amount, s.created_at, s.additional_attributes,
       'own'::text AS share_kind
FROM statements s
UNION ALL
SELECT sp.id, fp.linked_user_id, NULL::uuid, fp.linked_profile_id, sp.amount,
       COALESCE(a.category, st.category), COALESCE(a.tags, st.tags),
       'expense'::statement_kinds, NULL::numeric, st.created_at, '{}'::jsonb,
       'split'::text
FROM splits sp
JOIN friends_profiles fp
  ON fp.id = sp.friend_id AND fp.linked_user_id IS NOT NULL AND fp.linked_profile_id IS NOT NULL
JOIN statements st ON st.id = sp.statement_id
LEFT JOIN shared_answers a ON a.split_id = sp.id AND a.viewer_user_id = fp.linked_user_id
UNION ALL
SELECT st.id, fp.linked_user_id, NULL::uuid, fp.linked_profile_id, -st.amount,
       COALESCE(a.category, st.category), COALESCE(a.tags, st.tags),
       'friend_transaction'::statement_kinds, NULL::numeric, st.created_at, '{}'::jsonb,
       'balance'::text
FROM statements st
JOIN friends_profiles fp
  ON fp.id = st.friend_id AND fp.linked_user_id IS NOT NULL AND fp.linked_profile_id IS NOT NULL
LEFT JOIN shared_answers a ON a.statement_id = st.id AND a.viewer_user_id = fp.linked_user_id
WHERE st."statementKind" = 'friend_transaction' AND st.account_id IS NULL
UNION ALL
SELECT st.id, a.viewer_user_id, a.account_id, fp.linked_profile_id,
       CASE WHEN a.as_kind = 'expense' THEN abs(st.amount) ELSE -st.amount END,
       COALESCE(a.category, st.category), COALESCE(a.tags, st.tags),
       a.as_kind, NULL::numeric, st.created_at, '{}'::jsonb,
       'answer'::text
FROM shared_answers a
JOIN statements st ON st.id = a.statement_id
JOIN friends_profiles fp
  ON fp.id = st.friend_id AND fp.linked_user_id = a.viewer_user_id
     AND fp.linked_profile_id IS NOT NULL
WHERE a.status = 'accepted'
  AND ((st."statementKind" = 'friend_transaction' AND st.account_id IS NOT NULL)
    OR (st."statementKind" = 'expense' AND st.account_id IS NULL));
