DROP INDEX "self_transfer_statements_created_at_idx";--> statement-breakpoint
DROP INDEX "statements_created_at_idx";--> statement-breakpoint
CREATE INDEX "self_transfer_statements_created_at_idx" ON "self_transfer_statements" USING btree ("created_at" desc);--> statement-breakpoint
CREATE INDEX "statements_created_at_idx" ON "statements" USING btree ("created_at" desc);