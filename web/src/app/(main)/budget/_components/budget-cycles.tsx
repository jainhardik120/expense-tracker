'use client';

import { format, parse } from 'date-fns';

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

export const BudgetCycles = ({ detail }: { detail: Detail }) => {
  const { cycles, lines } = detail;
  // Column order follows the waterfall, so the table reads the same way the
  // budget does rather than in whatever order the data arrived.
  const names = [...lines].sort((a, b) => a.position - b.position).map((line) => line.name);
  const used = names.filter((name) => cycles.some((cycle) => (cycle.perLine[name] ?? 0) !== 0));

  const columnTotal = (name: string) =>
    cycles.reduce((sum, cycle) => sum + (cycle.perLine[name] ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Every pay cycle</CardTitle>
        <CardDescription>
          Each row runs from one salary to the next, which is the month the money actually lives in.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cycle</TableHead>
              {used.map((name) => (
                <TableHead key={name} className="text-right whitespace-nowrap">
                  {name}
                </TableHead>
              ))}
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cycles.map((cycle) => (
              <TableRow key={cycle.cycle}>
                <TableCell className="whitespace-nowrap">
                  {format(parse(cycle.cycle, 'yyyy-MM', new Date()), 'MMM yyyy')}
                </TableCell>
                {used.map((name) => (
                  <TableCell key={name} className="text-right tabular-nums">
                    {(cycle.perLine[name] ?? 0) === 0
                      ? '—'
                      : formatCurrency(cycle.perLine[name] ?? 0)}
                  </TableCell>
                ))}
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(cycle.total)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Average</TableCell>
              {used.map((name) => (
                <TableCell key={name} className="text-right font-semibold tabular-nums">
                  {formatCurrency(cycles.length > 0 ? columnTotal(name) / cycles.length : 0)}
                </TableCell>
              ))}
              <TableCell className="text-right font-semibold tabular-nums">
                {formatCurrency(
                  cycles.length > 0
                    ? cycles.reduce((sum, c) => sum + c.total, 0) / cycles.length
                    : 0,
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
