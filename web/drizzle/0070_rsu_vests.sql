CREATE TABLE "rsu_vests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"grant_id" uuid NOT NULL,
	"vest_date" timestamp NOT NULL,
	"units" numeric NOT NULL,
	"is_released" boolean DEFAULT false NOT NULL,
	"unit_price" numeric,
	"fx_rate_to_inr" numeric,
	"units_withheld" numeric,
	"grant_amount_released" numeric,
	"released_investment_id" uuid,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "rsu_vests_released_investment_id_unique" UNIQUE("released_investment_id"),
	CONSTRAINT "rsu_vests_units_check" CHECK ("rsu_vests"."units" > 0)
);
--> statement-breakpoint
ALTER TABLE "rsu_vests" ADD CONSTRAINT "rsu_vests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsu_vests" ADD CONSTRAINT "rsu_vests_grant_id_investments_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsu_vests" ADD CONSTRAINT "rsu_vests_released_investment_id_investments_id_fk" FOREIGN KEY ("released_investment_id") REFERENCES "public"."investments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rsu_vests_grant_date_idx" ON "rsu_vests" USING btree ("grant_id","vest_date");--> statement-breakpoint
CREATE INDEX "rsu_vests_user_idx" ON "rsu_vests" USING btree ("user_id");