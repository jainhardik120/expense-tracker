import { TriangleAlert } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ZonedDate } from '@/components/zoned-date';
import { formatCurrency } from '@/lib/format';
import type { YearDetail } from '@/types/router-outputs';

const KIND_LABELS: Record<string, string> = {
  expense: 'Expense',
  outside_transaction: 'Outside transaction',
  friend_transaction: 'Friend, no account',
};

export const UncountedAlert = ({ detail }: { detail: YearDetail }) => {
  const { uncounted } = detail;
  if (uncounted.length === 0) {
    return null;
  }
  const total = uncounted.reduce((sum, statement) => sum + statement.balanceEffect, 0);
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <TriangleAlert className="size-4" />
          {uncounted.length} {uncounted.length === 1 ? 'transaction is' : 'transactions are'} not in
          any line
        </CardTitle>
        <CardDescription>
          {uncounted.length === 1 ? 'It moved' : 'Together they moved'} your balance by{' '}
          {formatCurrency(total)}, but no budget or income line counts{' '}
          {uncounted.length === 1 ? 'it' : 'them'}. Until a line takes them up, the plan on the
          right of the summary works from {formatCurrency(Math.abs(total))}{' '}
          {total < 0 ? 'more' : 'less'} than you really have. Widen a line&apos;s rule below, or add
          an income line for them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="text-right">Effect on balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {uncounted.map((statement) => (
              <TableRow key={statement.id}>
                <TableCell>
                  <ZonedDate value={statement.createdAt} />
                </TableCell>
                <TableCell>
                  {KIND_LABELS[statement.statementKind] ?? statement.statementKind}
                </TableCell>
                <TableCell>{statement.category ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {statement.tags.length === 0 ? '—' : statement.tags.join(', ')}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(statement.balanceEffect)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
