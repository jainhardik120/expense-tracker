'use client';

import { formatDistanceToNow } from 'date-fns';

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

type Estimate = RouterOutput['smsNotifications']['getPendingEstimate'];

export const PendingEstimate = ({ estimate }: { estimate: Estimate }) => {
  if (estimate.count === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Not entered yet</CardTitle>
        <CardDescription>
          {estimate.count} messages waiting
          {estimate.oldest === null
            ? ''
            : `, the oldest from ${formatDistanceToNow(estimate.oldest)} ago`}
          . Every balance in the app is behind by this much until they are entered.
        </CardDescription>
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
        <p className="text-muted-foreground text-xs">
          Accounts are guessed from how messages like these were filed before. One marked unmatched
          still counts towards the total, it just has no balance to adjust.
        </p>
      </CardContent>
    </Card>
  );
};
