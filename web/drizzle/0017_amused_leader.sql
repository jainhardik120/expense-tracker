ALTER TABLE "splits" DROP CONSTRAINT "splits_statement_id_statements_id_fk";
--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE cascade ON UPDATE no action;