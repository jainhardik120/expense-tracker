CREATE TABLE "instrument_asset_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"investment_kind" text NOT NULL,
	"instrument_code" text NOT NULL,
	"asset_class" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instrument_asset_classes" ADD CONSTRAINT "instrument_asset_classes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_asset_classes_instrument_idx" ON "instrument_asset_classes" USING btree ("user_id","investment_kind","instrument_code");