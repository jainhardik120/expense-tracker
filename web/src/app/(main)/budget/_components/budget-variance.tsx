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
          <TableHead className="text-right">Allowed so far</TableHead>
          <TableHead className="text-right">Spent</TableHead>
          <TableHead className="text-right">Difference</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((line) => (
          <TableRow key={line.lineId}>
            <TableCell className="font-medium">{line.name}</TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {formatCurrency(line.budgetToDate)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(line.actual)}</TableCell>
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
          Measured against {projection.elapsedMonths} cycles of allowance, not the whole year.
          Monthly lines accrue as they go; an envelope is a pot for the year, so spending it early
          is not overspending it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Section
          blurb="This came out of what would otherwise have been invested."
          rows={over}
          title="Spent above the plan"
          tone="over"
          total={overTotal}
        />
        {saved.length === 0 ? null : (
          <Section
            blurb="Spent less than planned with nothing still to come for it, so this went straight to investment."
            rows={saved}
            title="Saved by spending less"
            tone="under"
            total={savedTotal}
          />
        )}
        {reserved.length === 0 ? null : (
          <Section
            blurb="Still in the envelope and still to be spent — held back, not saved."
            rows={reserved}
            title="Set aside, not yet spent"
            tone="under"
            total={reservedTotal}
          />
        )}
      </CardContent>
    </Card>
  );
};
