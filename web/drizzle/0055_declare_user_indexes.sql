CREATE INDEX IF NOT EXISTS "self_transfer_user_created_id_idx" ON "self_transfer_statements" USING btree ("user_id","created_at" desc,"id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "splits_statement_id_idx" ON "splits" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "splits_user_statement_idx" ON "splits" USING btree ("user_id","statement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "statements_user_created_id_idx" ON "statements" USING btree ("user_id","created_at" desc,"id");