CREATE TYPE "public"."statement_import_source" AS ENUM('upload', 'email');--> statement-breakpoint
CREATE TYPE "public"."statement_import_status" AS ENUM('review', 'applied', 'discarded');--> statement-breakpoint
CREATE TABLE "statement_import_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"statement_id" uuid,
	"self_transfer_id" uuid,
	CONSTRAINT "statement_import_links_one_target" CHECK (num_nonnulls("statement_import_links"."statement_id", "statement_import_links"."self_transfer_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "statement_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"source" "statement_import_source" NOT NULL,
	"inbound_email_id" uuid,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"issuer" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"statement_date" date,
	"opening_balance" numeric,
	"closing_balance" numeric,
	"total_due" numeric,
	"rows" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"outcome" jsonb,
	"status" "statement_import_status" DEFAULT 'review' NOT NULL,
	"created_at" timestamp NOT NULL,
	"applied_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "statement_sources" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"issuer" text NOT NULL,
	"card_last4" text,
	"password" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "statement_import_links" ADD CONSTRAINT "statement_import_links_import_id_statement_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."statement_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_import_links" ADD CONSTRAINT "statement_import_links_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_import_links" ADD CONSTRAINT "statement_import_links_self_transfer_id_self_transfer_statements_id_fk" FOREIGN KEY ("self_transfer_id") REFERENCES "public"."self_transfer_statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_account_id_bank_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_inbound_email_id_inbound_emails_id_fk" FOREIGN KEY ("inbound_email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_sources" ADD CONSTRAINT "statement_sources_account_id_bank_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_sources" ADD CONSTRAINT "statement_sources_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "statement_import_links_import_idx" ON "statement_import_links" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "statement_import_links_statement_idx" ON "statement_import_links" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "statement_import_links_self_transfer_idx" ON "statement_import_links" USING btree ("self_transfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_imports_user_file_idx" ON "statement_imports" USING btree ("user_id","file_hash");--> statement-breakpoint
CREATE INDEX "statement_imports_account_period_idx" ON "statement_imports" USING btree ("account_id","period_start");--> statement-breakpoint
CREATE INDEX "statement_imports_user_status_idx" ON "statement_imports" USING btree ("user_id","status");