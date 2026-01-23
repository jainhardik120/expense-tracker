ALTER TABLE "statements" DROP CONSTRAINT "friend_transaction_check";--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "friend_transaction_check" CHECK (
      ("statements"."statementKind" != 'friend_transaction') OR 
      ("statements"."friend_id" IS NOT NULL)
    );