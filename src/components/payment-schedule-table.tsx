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
import { parseFloatSafe } from '@/server/helpers/emi-calculations';
import { PERCENTAGE_DIVISOR, type EMICalculationResult } from '@/types';

interface PaymentScheduleTableProps {
  result: EMICalculationResult;
}

export const PaymentScheduleTable = ({ result }: PaymentScheduleTableProps) => {
  const showDates = result.savedEMIData !== undefined;
  const showGST = result.summary.totalGST > 0;
  const iafe = parseFloatSafe(result.savedEMIData?.iafe);
  const iafeGST =
    showGST && iafe > 0
      ? (iafe * parseFloatSafe(result.savedEMIData?.gst)) / PERCENTAGE_DIVISOR
      : 0;
  const totalIAFE = iafe + iafeGST;

  const hasProcessingFees = result.summary.processingFees > 0;

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
                {showGST ? <TableHead className="text-right">GST</TableHead> : null}
                <TableHead className="text-right">Total Payment</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hasProcessingFees ? (
                <TableRow className="bg-muted/50">
                  <TableCell className="font-medium">-</TableCell>
                  {showDates ? (
                    <TableCell>
                      {result.savedEMIData?.processingFeesDate === undefined
                        ? '-'
                        : format(result.savedEMIData.processingFeesDate, 'dd MMM yyyy')}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">-</TableCell>
                  <TableCell className="text-right">-</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(result.summary.processingFees)}
                  </TableCell>
                  {showGST ? (
                    <TableCell className="text-right">
                      {formatCurrency(result.summary.processingFeesGST)}
                    </TableCell>
                  ) : null}
                  {iafe > 0 && <TableCell className="text-right">-</TableCell>}
                  <TableCell className="text-right font-medium">
                    {formatCurrency(result.summary.totalProcessingFees)}
                  </TableCell>
                  <TableCell className="text-right">-</TableCell>
                </TableRow>
              ) : null}
              {result.schedule.map((row, index) => {
                const isFirstEMI = index === 0;
                const gstWithIAFE = isFirstEMI && iafeGST > 0 ? row.gst + iafeGST : row.gst;
                const totalPaymentWithIAFE =
                  isFirstEMI && totalIAFE > 0 ? row.totalPayment + totalIAFE : row.totalPayment;
                return (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    {showDates ? (
                      <TableCell>
                        {result.savedEMIData?.firstInstallmentDate === undefined
                          ? '-'
                          : format(
                              new Date(
                                result.savedEMIData.firstInstallmentDate.getFullYear(),
                                result.savedEMIData.firstInstallmentDate.getMonth() + index,
                                result.savedEMIData.firstInstallmentDate.getDate(),
                              ),
                              'dd MMM yyyy',
                            )}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right">{formatCurrency(row.emi)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.interest + iafe)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.principal)}</TableCell>
                    {showGST ? (
                      <TableCell className="text-right">{formatCurrency(gstWithIAFE)}</TableCell>
                    ) : null}
                    <TableCell className="text-right font-medium">
                      {formatCurrency(totalPaymentWithIAFE)}
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
