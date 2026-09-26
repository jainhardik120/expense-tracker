CREATE TYPE "public"."budget_allocation_kind" AS ENUM('monthly', 'annual', 'residual', 'earmarked');--> statement-breakpoint
CREATE TYPE "public"."budget_income_destination" AS ENUM('waterfall', 'line', 'excluded');--> statement-breakpoint
CREATE TABLE "budget_income_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"destination" "budget_income_destination" NOT NULL,
	"destination_line_id" uuid,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allocation_kind" "budget_allocation_kind" NOT NULL,
	"allocation_amount" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_income_lines" ADD CONSTRAINT "budget_income_lines_budget_year_id_budget_years_id_fk" FOREIGN KEY ("budget_year_id") REFERENCES "public"."budget_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_income_lines" ADD CONSTRAINT "budget_income_lines_destination_line_id_budget_lines_id_fk" FOREIGN KEY ("destination_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_year_id_budget_years_id_fk" FOREIGN KEY ("budget_year_id") REFERENCES "public"."budget_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_years" ADD CONSTRAINT "budget_years_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_lines_year_position_idx" ON "budget_lines" USING btree ("budget_year_id","position");