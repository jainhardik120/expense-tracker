-- Income still to come used to be guessed: the average of the payslips that had
-- already arrived, multiplied by the cycles left. That average cannot see a pay
-- revision coming, and cannot know the last pay date of a budget year falls
-- outside it. It is read off the salary schedule now, through two lines that
-- behave like every other income line -- they can be pointed down the waterfall,
-- at a single line, or out of the budget.
--
-- Every existing budget year gets both, appended below whatever is already
-- there. Salary goes down the waterfall, which is what the guess it replaces was
-- doing. Bonuses start outside the budget: a forecast bonus is the least certain
-- money in here, and quietly raising the investment goal on the strength of one
-- is the wrong default. Point it wherever it belongs.
-- created_at is set by the application rather than the database, so a plain
-- SQL insert has to supply it.
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
