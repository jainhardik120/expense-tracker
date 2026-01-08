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

import { type CalculationResult } from './types';

interface PaymentScheduleTableProps {
  result: CalculationResult;
}

export const PaymentScheduleTable = ({ result }: PaymentScheduleTableProps) => {
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
                <TableHead className="text-right">EMI</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                {result.summary.totalGST > 0 && <TableHead className="text-right">GST</TableHead>}
                <TableHead className="text-right">Total Payment</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.schedule.map((row) => (
                <TableRow key={row.month}>
                  <TableCell className="font-medium">{row.month}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.emi)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.interest)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.principal)}</TableCell>
                  {result.summary.totalGST > 0 && (
                    <TableCell className="text-right">{formatCurrency(row.gst)}</TableCell>
                  )}
                  <TableCell className="text-right font-medium">
                    {formatCurrency(row.totalPayment)}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(row.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
