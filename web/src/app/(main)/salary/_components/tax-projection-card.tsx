'use client';

import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';

import { TaxProjectionDialog } from './salary-dialogs';
import { type SalaryData } from './shared';

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <>
    <span className={strong === true ? 'border-t pt-3 font-semibold' : 'text-muted-foreground'}>
      {label}
    </span>
    <span
      className={`text-right tabular-nums ${strong === true ? 'border-t pt-3 font-semibold' : 'font-medium'}`}
    >
      {value}
    </span>
  </>
);

export const TaxProjectionCard = ({ data }: { data: SalaryData }) => {
  const { tax } = data.summary;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax projection</CardTitle>
        <CardAction>
          <TaxProjectionDialog data={data} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Row label="Gross taxable inputs" value={formatCurrency(tax.grossTaxableIncome)} />
        <Row label="Taxable after deductions" value={formatCurrency(tax.taxableIncome)} />
        <Row label="Slab tax" value={formatCurrency(tax.slabTax)} />
        <Row label="Rebate / marginal relief" value={`− ${formatCurrency(tax.rebate)}`} />
        <Row label="Surcharge" value={formatCurrency(tax.surcharge)} />
        <Row label="Health & education cess" value={formatCurrency(tax.cess)} />
        <Row label="Projected tax" strong value={formatCurrency(tax.totalTax)} />
      </CardContent>
    </Card>
  );
};
