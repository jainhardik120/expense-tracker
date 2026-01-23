ALTER TABLE "statements" ALTER COLUMN "statementKind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "statements" ALTER COLUMN "statementKind" SET DEFAULT 'expense'::text;--> statement-breakpoint
DROP TYPE "public"."statement_kinds";--> statement-breakpoint
CREATE TYPE "public"."statement_kinds" AS ENUM('expense', 'outside_transaction', 'friend_transaction');--> statement-breakpoint
ALTER TABLE "statements" ALTER COLUMN "statementKind" SET DEFAULT 'expense'::"public"."statement_kinds";--> statement-breakpoint
ALTER TABLE "statements" ALTER COLUMN "statementKind" SET DATA TYPE "public"."statement_kinds" USING "statementKind"::"public"."statement_kinds";