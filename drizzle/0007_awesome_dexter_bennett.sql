ALTER TABLE "statements" ADD CONSTRAINT "expense_check" CHECK (
      ("statements"."statementKind" != 'expense') OR 
      (("statements"."account_id" IS NOT NULL AND "statements"."friend_id" IS NULL) OR 
       ("statements"."account_id" IS NULL AND "statements"."friend_id" IS NOT NULL))
    );--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "friend_transaction_check" CHECK (
      ("statements"."statementKind" != 'friend_transaction') OR 
      ("statements"."account_id" IS NOT NULL AND "statements"."friend_id" IS NOT NULL)
    );--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "outside_transaction_check" CHECK (
      ("statements"."statementKind" != 'outside_transaction') OR 
      ("statements"."friend_id" IS NULL)
    );