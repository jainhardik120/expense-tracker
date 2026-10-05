'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';
import type { PendingSmsEstimate } from '@/types/router-outputs';

export const PendingEstimate = ({ estimate }: { estimate: PendingSmsEstimate }) => {
  if (estimate.count === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Not entered yet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Spent, not yet recorded</p>
            <p className="text-2xl font-semibold text-red-600">
              {formatCurrency(estimate.totalSpend)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Balance the app shows</p>
            <p className="text-2xl font-semibold">{formatCurrency(estimate.balanceNow)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Balance you actually have</p>
            <p className="text-2xl font-semibold">{formatCurrency(estimate.balanceAfter)}</p>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Waiting</TableHead>
              <TableHead className="text-right">Spent</TableHead>
              <TableHead className="text-right">Shown</TableHead>
              <TableHead className="text-right">Actually</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {estimate.byAccount.map((group) => (
              <TableRow key={group.accountName}>
                <TableCell className="font-medium">{group.accountName}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {group.count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(group.pendingSpend)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {group.balanceNow === null ? '—' : formatCurrency(group.balanceNow)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {group.balanceAfter === null ? '—' : formatCurrency(group.balanceAfter)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
