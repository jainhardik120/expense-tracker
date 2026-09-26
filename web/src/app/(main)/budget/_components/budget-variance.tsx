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
export const BudgetVariance = ({ detail }: { detail: Detail }) => {
  const { projection } = detail;
  const spendLines = projection.lines.filter((line) => line.allocationKind !== 'residual');
  const over = spendLines.filter((line) => line.variance > 0);
  const under = spendLines.filter((line) => line.variance <= 0);
  const netVariance = spendLines.reduce((sum, line) => sum + line.variance, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where the saving went</CardTitle>
        <CardDescription>
          Spending above an allowance comes out of what would have been invested. Measured against{' '}
          {projection.elapsedMonths} months of allowance, not the whole year.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Line</TableHead>
              <TableHead className="text-right">Allowed so far</TableHead>
              <TableHead className="text-right">Spent</TableHead>
              <TableHead className="text-right">Cost to saving</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...over, ...under].map((line) => (
              <TableRow key={line.lineId}>
                <TableCell className="font-medium">{line.name}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {formatCurrency(line.budgetToDate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(line.actual)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    line.variance > 0 ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {line.variance > 0 ? '+' : ''}
                  {formatCurrency(line.variance)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Net</TableCell>
              <TableCell />
              <TableCell />
              <TableCell
                className={`text-right font-semibold tabular-nums ${
                  netVariance > 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {netVariance > 0 ? '+' : ''}
                {formatCurrency(netVariance)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <p className="text-muted-foreground mt-3 text-sm">
          {netVariance > 0
            ? `${formatCurrency(netVariance)} more than planned has been spent so far, and that is money not invested.`
            : `${formatCurrency(-netVariance)} less than planned has been spent so far, which has gone into saving.`}
        </p>
      </CardContent>
    </Card>
  );
};
