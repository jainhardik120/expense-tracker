'use client';

import { useState } from 'react';

import { Eye } from 'lucide-react';

import Modal from '@/components/modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/format';
import { hasMaterialSalaryNetMismatch } from '@/lib/salary';

import {
  classificationLabels,
  formatPeriod,
  formatSignedCurrency,
  type SalaryRow,
  statusPresentation,
  tdsAdjustment,
} from './shared';

const Detail = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

/** Everything the payroll row leaves out: which revision, which lines, which adjustments. */
export const PayrollBreakdownDialog = ({ row }: { row: SalaryRow }) => {
  const [open, setOpen] = useState(false);
  const bonusTds = tdsAdjustment(row, 'bonus_tds');
  const reconciliationTds = tdsAdjustment(row, 'year_end_reconciliation');
  const mismatch = hasMaterialSalaryNetMismatch(row.statementAmount, row.totals.net);

  return (
    <Modal
      className="sm:max-w-2xl"
      open={open}
      setOpen={setOpen}
      title={formatPeriod(row.periodStart)}
      trigger={
        <Button size="icon" title="View breakdown" variant="ghost">
          <Eye />
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2 rounded-lg border p-4 sm:grid-cols-2">
          <Detail label="Revision" value={row.revisionName} />
          <Detail
            label="Status"
            value={
              <Badge variant={statusPresentation[row.status].variant}>
                {statusPresentation[row.status].label}
              </Badge>
            }
          />
          <Detail label="Pay date" value={formatDate(row.paymentDate)} />
          <Detail label="Days paid" value={`${row.daysPaid} / ${row.daysInPeriod}`} />
          {bonusTds === 0 ? null : (
            <Detail label="Bonus tax in TDS" value={formatSignedCurrency(bonusTds)} />
          )}
          {reconciliationTds === 0 ? null : (
            <Detail label="Tax balance in TDS" value={formatSignedCurrency(reconciliationTds)} />
          )}
          {row.statementAmount === null ? null : (
            <Detail
              label="Linked bank credit"
              value={
                <span className={mismatch ? 'text-destructive font-semibold' : undefined}>
                  {formatCurrency(row.statementAmount)}
                </span>
              }
            />
          )}
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {row.components.map((line) => (
                <TableRow key={`${line.name}-${line.amount}`}>
                  <TableCell className="font-medium">{line.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {line.kind} · {classificationLabels[line.classification]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(line.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Net</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.totals.net)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>
    </Modal>
  );
};
