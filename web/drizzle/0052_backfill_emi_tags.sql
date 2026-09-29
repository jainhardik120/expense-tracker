-- A loan now carries the tags its instalments carry, so a budget line can find
-- it before the first instalment is paid. Loans taken out before the column
-- existed have nothing on them, and the tags they should have are already sitting
-- on the statements they produced -- a gym plan's instalments are tagged
-- "Gym EMI" because that is what they were filed as.
--
-- Only loans with no tags at all are touched: anything already tagged was tagged
-- deliberately and is left alone.
UPDATE "emis" AS e
SET "tags" = filed."tags"
FROM (
  SELECT
    s."additional_attributes"->>'emiId' AS emi_id,
    array_agg(DISTINCT tag) AS "tags"
  FROM "statements" AS s, unnest(s."tags") AS tag
  WHERE s."additional_attributes"->>'emiId' IS NOT NULL
  GROUP BY 1
) AS filed
WHERE e."id"::text = filed.emi_id
  AND cardinality(e."tags") = 0;
