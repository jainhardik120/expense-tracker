ALTER TABLE "statements" ADD COLUMN "taxable_amount" numeric;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statement_taxable_amount_check" CHECK (
      ("statements"."taxable_amount" IS NULL) OR
      ("statements"."statementKind" = 'outside_transaction' AND
       "statements"."amount" > 0 AND
       "statements"."taxable_amount" > 0 AND
       "statements"."taxable_amount" <= "statements"."amount")
    );