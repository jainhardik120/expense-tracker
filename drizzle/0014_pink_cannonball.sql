ALTER TABLE "statements" DROP CONSTRAINT "outside_transaction_check";--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "outside_transaction_check" CHECK (
      ("statements"."statementKind" != 'outside_transaction') OR 
      ("statements"."account_id" IS NOT NULL AND "statements"."friend_id" IS NULL)
    );