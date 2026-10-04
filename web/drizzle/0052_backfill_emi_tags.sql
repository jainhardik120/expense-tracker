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
