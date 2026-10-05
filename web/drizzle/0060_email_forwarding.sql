CREATE TYPE "public"."inbound_email_status" AS ENUM('received', 'confirmation', 'rejected');--> statement-breakpoint
CREATE TABLE "email_inboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"confirmation_code" text,
	"confirmation_url" text,
	"confirmation_received_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"inbox_id" uuid NOT NULL,
	"ses_message_id" text NOT NULL,
	"received_at" timestamp NOT NULL,
	"from_address" text NOT NULL,
	"from_domain" text NOT NULL,
	"subject" text NOT NULL,
	"dkim_verdict" text NOT NULL,
	"dmarc_verdict" text NOT NULL,
	"spam_verdict" text NOT NULL,
	"virus_verdict" text NOT NULL,
	"status" "inbound_email_status" NOT NULL,
	"reject_reason" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"object_key" text
);
--> statement-breakpoint
ALTER TABLE "email_inboxes" ADD CONSTRAINT "email_inboxes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_inbox_id_email_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."email_inboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_inboxes_token_idx" ON "email_inboxes" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "email_inboxes_active_user_idx" ON "email_inboxes" USING btree ("user_id") WHERE "email_inboxes"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_emails_ses_message_idx" ON "inbound_emails" USING btree ("ses_message_id");--> statement-breakpoint
CREATE INDEX "inbound_emails_user_received_idx" ON "inbound_emails" USING btree ("user_id","received_at" desc);