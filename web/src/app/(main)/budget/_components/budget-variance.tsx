'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';
import { type RouterOutput } from '@/server/routers';

type Detail = RouterOutput['budget']['getYearDetail'];

/**
 * Why saving fell short of the plan.
 *
 * Every rupee spent above a line's allowance came out of what would otherwise
 * have been invested, so the variances add up to exactly the gap. Lines with no
 * allowance -- gifts, a trip -- are the clearest case: nothing was set aside for
 * them, so all of it came out of saving.
 */
type ProjectedLine = Detail['projection']['lines'][number];

const Section = ({
  title,
  blurb,
  rows,
  total,
  tone,
}: {
  title: string;
  blurb: string;
  rows: ProjectedLine[];
  total: number;
  tone: 'over' | 'under';
}) => (
  <div>
    <p className="font-medium">{title}</p>
    <p className="text-muted-foreground mb-2 text-sm">{blurb}</p>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Line</TableHead>
          <TableHead className="text-right">Year budget</TableHead>
          <TableHead className="text-right">Spent so far</TableHead>
          <TableHead className="text-right">Still to come</TableHead>
          <TableHead className="text-right">Year total</TableHead>
          <TableHead className="text-right">Difference</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((line) => (
          <TableRow key={line.lineId}>
            <TableCell className="font-medium">{line.name}</TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {formatCurrency(line.yearBudget)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(line.actual)}</TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {line.forecastRemaining === 0 ? '—' : formatCurrency(line.forecastRemaining)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(line.projectedSpend)}
            </TableCell>
            <TableCell
              className={`text-right tabular-nums ${
                tone === 'over' ? 'text-red-600' : 'text-green-600'
              }`}
            >
              {formatCurrency(Math.abs(line.variance))}
            </TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell className="font-semibold">Total</TableCell>
          <TableCell />
          <TableCell />
          <TableCell />
          <TableCell />
          <TableCell
            className={`text-right font-semibold tabular-nums ${
              tone === 'over' ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {formatCurrency(Math.abs(total))}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
);

export const BudgetVariance = ({ detail }: { detail: Detail }) => {
  const { projection } = detail;
  const spendLines = projection.lines.filter((line) => line.allocationKind !== 'residual');
  const over = spendLines
    .filter((line) => line.variance > 0.5)
    .sort((a, b) => b.variance - a.variance);
  const under = spendLines.filter((line) => line.variance < -0.5);
  // Money not spent is only saved if nothing is still coming for it. An envelope
  // holds its balance for the trip yet to be booked; rent paid under budget is
  // not a plan to overpay later.
  const reserved = under
    .filter((line) => !line.unspentIsSaved)
    .sort((a, b) => a.variance - b.variance);
  const saved = under.filter((line) => line.unspentIsSaved).sort((a, b) => a.variance - b.variance);
  const overTotal = over.reduce((sum, line) => sum + line.variance, 0);
  const reservedTotal = reserved.reduce((sum, line) => sum + line.variance, 0);
  const savedTotal = saved.reduce((sum, line) => sum + line.variance, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where the saving went</CardTitle>
        <CardDescription>
          The whole year, reconciled: what was budgeted against what will actually have been spent
          by December. Commitments still to come — loan instalments, recurring payments, the flight
          not yet booked — are counted, so this is the year-end position rather than the one today.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Section
          blurb="By the end of the year this will have come out of what would otherwise have been invested."
          rows={over}
          title="Over the plan for the year"
          tone="over"
          total={overTotal}
        />
        {saved.length === 0 ? null : (
          <Section
            blurb="Will close under its budget with nothing more owed, so this goes to investment."
            rows={saved}
            title="Saved by spending less"
            tone="under"
            total={savedTotal}
          />
        )}
        {reserved.length === 0 ? null : (
          <Section
            blurb="Closes on budget once what is still owed has been paid."
            rows={reserved}
            title="On plan"
            tone="under"
            total={reservedTotal}
          />
        )}
      </CardContent>
    </Card>
  );
};
