import { format } from 'date-fns';

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
import { type EMICalculationResult } from '@/types';

interface PaymentScheduleTableProps {
  result: EMICalculationResult;
}

export const PaymentScheduleTable = ({ result }: PaymentScheduleTableProps) => {
  const showDates = result.schedule.some((row) => row.date !== undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Schedule</CardTitle>
        <CardDescription>Detailed month-by-month payment breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Month</TableHead>
                {showDates ? <TableHead>Date</TableHead> : null}
                <TableHead className="text-right">EMI</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Total Payment</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.schedule.map((row) => {
                return (
                  <TableRow key={row.installment}>
                    <TableCell className="font-medium">{row.installment}</TableCell>
                    {showDates ? (
                      <TableCell>
                        {row.date === undefined ? '-' : format(row.date, 'dd MMM yyyy')}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right">{formatCurrency(row.emi)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.interest)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.principal)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.gst)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(row.totalPayment)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.balance)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
