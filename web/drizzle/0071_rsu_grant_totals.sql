UPDATE "investments" AS "grant"
SET
  "units" = "grant"."units" + "released"."units",
  "investment_amount" = "grant"."investment_amount" + "released"."amount",
  "is_closed" = false,
  "closed_at" = NULL
FROM (
  SELECT "grant_id", sum("units") AS "units", sum(coalesce("grant_amount_released", 0)) AS "amount"
  FROM "rsu_vests"
  WHERE "is_released"
  GROUP BY "grant_id"
) AS "released"
WHERE "grant"."id" = "released"."grant_id";--> statement-breakpoint
ALTER TABLE "rsu_vests" DROP COLUMN "grant_amount_released";
