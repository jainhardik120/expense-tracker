import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import { type EMICalculationResult } from '@/types';

interface SummaryCardProps {
  result: EMICalculationResult;
}

export const SummaryCard = ({ result }: SummaryCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-sm">Effective Principal</p>
            <p className="text-2xl font-bold">
              {formatCurrency(result.summary.effectivePrincipal)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Monthly EMI</p>
            <p className="text-2xl font-bold">{formatCurrency(result.schedule[0]?.emi ?? 0)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Total Interest</p>
            <p className="text-2xl font-bold">{formatCurrency(result.summary.totalInterest)}</p>
          </div>
          {result.summary.totalGST > 0 && (
            <div>
              <p className="text-muted-foreground text-sm">Total GST on Interest</p>
              <p className="text-2xl font-bold">{formatCurrency(result.summary.totalGST)}</p>
            </div>
          )}
          {result.summary.processingFees > 0 && (
            <>
              <div>
                <p className="text-muted-foreground text-sm">Processing Fees</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(result.summary.processingFees)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Processing Fees GST</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(result.summary.processingFeesGST)}
                </p>
              </div>
            </>
          )}
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="text-muted-foreground text-sm">Total Amount Payable</p>
            <p className="text-primary text-3xl font-bold">
              {formatCurrency(result.summary.totalAmount)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
