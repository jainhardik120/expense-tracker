INSERT INTO "budget_income_lines"
  ("budget_year_id", "name", "position", "rule", "source", "destination", "created_at")
SELECT
  y."id",
  seed."name",
  COALESCE((SELECT MAX(l."position") FROM "budget_income_lines" l WHERE l."budget_year_id" = y."id"), -1)
    + seed."offset",
  '{}'::jsonb,
  seed."source"::"public"."budget_income_source",
  seed."destination"::"public"."budget_income_destination",
  now()
FROM "budget_years" y
CROSS JOIN (
  VALUES
    ('Salary still to come', 'pending_salary', 'waterfall', 1),
    ('Bonuses still to come', 'pending_bonus', 'excluded', 2)
) AS seed("name", "source", "destination", "offset")
WHERE NOT EXISTS (
  SELECT 1 FROM "budget_income_lines" existing
  WHERE existing."budget_year_id" = y."id" AND existing."source"::text = seed."source"
);
