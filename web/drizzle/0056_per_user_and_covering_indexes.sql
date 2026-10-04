CREATE INDEX IF NOT EXISTS "bank_account_user_idx" ON "bank_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_years_user_idx" ON "budget_years" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emis_user_idx" ON "emis" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friends_profiles_user_idx" ON "friends_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investments_user_idx" ON "investments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_payments_user_idx" ON "recurring_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_notifications_user_idx" ON "sms_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "statements_user_emi_idx" ON "statements" USING btree ("user_id",("additional_attributes"->>'emiId')) WHERE "statements"."additional_attributes"->>'emiId' IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "statements_user_recurring_idx" ON "statements" USING btree ("user_id") WHERE "statements"."additional_attributes"->>'recurringPaymentId' IS NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "statements_user_created_id_idx";--> statement-breakpoint
CREATE INDEX "statements_user_created_id_idx" ON "statements" USING btree ("user_id","created_at" desc,"id") INCLUDE ("account_id","friend_id","statementKind","amount","category");--> statement-breakpoint
DROP INDEX IF EXISTS "splits_user_statement_idx";--> statement-breakpoint
CREATE INDEX "splits_user_statement_idx" ON "splits" USING btree ("user_id","statement_id") INCLUDE ("friend_id","amount");
