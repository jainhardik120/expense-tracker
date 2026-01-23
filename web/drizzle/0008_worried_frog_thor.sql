ALTER TABLE "splits" ALTER COLUMN "friend_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "statements" ALTER COLUMN "statementKind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "statements" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "statements" ALTER COLUMN "updated_at" SET NOT NULL;