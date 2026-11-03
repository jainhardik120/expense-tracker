CREATE TABLE "market_instruments" (
	"instrument_key" text PRIMARY KEY NOT NULL,
	"name" text,
	"name_fetched_at" timestamp,
	"quote" jsonb,
	"quote_fetched_at" timestamp,
	"history_start" date,
	"history_end" date,
	"history_synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "market_prices" (
	"instrument_key" text NOT NULL,
	"day" date NOT NULL,
	"price" numeric NOT NULL,
	CONSTRAINT "market_prices_instrument_key_day_pk" PRIMARY KEY("instrument_key","day")
);
