CREATE TYPE "public"."salary_component_classification" AS ENUM('regular', 'tax_withholding', 'provident_fund', 'other');--> statement-breakpoint
CREATE TYPE "public"."salary_component_frequency" AS ENUM('monthly', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."salary_component_kind" AS ENUM('earning', 'deduction');--> statement-breakpoint
CREATE TYPE "public"."salary_pay_date_rule" AS ENUM('exact', 'previous_weekday');--> statement-breakpoint
CREATE TABLE "salary_bonuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"component_id" uuid NOT NULL,
	"expected_date" timestamp NOT NULL,
	"estimated_amount" numeric NOT NULL,
	"actual_amount" numeric,
	"notes" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "salary_component_kind" NOT NULL,
	"frequency" "salary_component_frequency" DEFAULT 'monthly' NOT NULL,
	"classification" "salary_component_classification" DEFAULT 'regular' NOT NULL,
	"affects_taxable_income" boolean DEFAULT false NOT NULL,
	"proratable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_payment_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"component_id" uuid,
	"bonus_id" uuid,
	"name" text NOT NULL,
	"kind" "salary_component_kind" NOT NULL,
	"classification" "salary_component_classification" DEFAULT 'regular' NOT NULL,
	"affects_taxable_income" boolean DEFAULT false NOT NULL,
	"amount" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"revision_id" uuid NOT NULL,
	"statement_id" uuid,
	"period_start" timestamp NOT NULL,
	"payment_date" timestamp NOT NULL,
	"days_paid" integer NOT NULL,
	"days_in_period" integer NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "salary_payments_statement_id_unique" UNIQUE("statement_id")
);
--> statement-breakpoint
CREATE TABLE "salary_revision_components" (
	"revision_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	CONSTRAINT "salary_revision_components_revision_id_component_id_pk" PRIMARY KEY("revision_id","component_id")
);
--> statement-breakpoint
CREATE TABLE "salary_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"effective_from" timestamp NOT NULL,
	"pay_day" integer DEFAULT 25 NOT NULL,
	"pay_date_rule" "salary_pay_date_rule" DEFAULT 'previous_weekday' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_tax_settings" (
	"user_id" text NOT NULL,
	"financial_year_start" integer NOT NULL,
	"standard_deduction" numeric DEFAULT '75000' NOT NULL,
	"other_taxable_income" numeric DEFAULT '0' NOT NULL,
	"other_deductions" numeric DEFAULT '0' NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "salary_tax_settings_user_id_financial_year_start_pk" PRIMARY KEY("user_id","financial_year_start")
);
--> statement-breakpoint
ALTER TABLE "salary_bonuses" ADD CONSTRAINT "salary_bonuses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_bonuses" ADD CONSTRAINT "salary_bonuses_component_id_salary_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."salary_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payment_components" ADD CONSTRAINT "salary_payment_components_payment_id_salary_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."salary_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payment_components" ADD CONSTRAINT "salary_payment_components_component_id_salary_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."salary_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payment_components" ADD CONSTRAINT "salary_payment_components_bonus_id_salary_bonuses_id_fk" FOREIGN KEY ("bonus_id") REFERENCES "public"."salary_bonuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_revision_id_salary_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."salary_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_revision_components" ADD CONSTRAINT "salary_revision_components_revision_id_salary_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."salary_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_revision_components" ADD CONSTRAINT "salary_revision_components_component_id_salary_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."salary_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_revisions" ADD CONSTRAINT "salary_revisions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_tax_settings" ADD CONSTRAINT "salary_tax_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "salary_bonuses_user_date_idx" ON "salary_bonuses" USING btree ("user_id","expected_date");--> statement-breakpoint
CREATE UNIQUE INDEX "salary_components_user_name_idx" ON "salary_components" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "salary_payment_components_payment_idx" ON "salary_payment_components" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "salary_payments_user_revision_period_idx" ON "salary_payments" USING btree ("user_id","revision_id","period_start");--> statement-breakpoint
CREATE INDEX "salary_payments_user_date_idx" ON "salary_payments" USING btree ("user_id","payment_date");--> statement-breakpoint
CREATE INDEX "salary_revisions_user_effective_idx" ON "salary_revisions" USING btree ("user_id","effective_from");