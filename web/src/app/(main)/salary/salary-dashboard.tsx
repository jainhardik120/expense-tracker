'use client';

import { useRouter } from 'next/navigation';

import {
  CalendarClock,
  Landmark,
  ReceiptIndianRupee,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import { formatFinancialYearLabel } from '@/lib/salary';

import { BonusesCard } from './_components/bonuses-card';
import { OutsideIncomeCard } from './_components/outside-income-card';
import { PayrollTable } from './_components/payroll-table';
import { type SalaryData } from './_components/shared';
import { TaxProjectionCard } from './_components/tax-projection-card';

const SummaryCard = ({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
}) => (
  <Card className="gap-3 py-5">
    <CardHeader className="px-5">
      <CardDescription>{title}</CardDescription>
      <CardAction>
        <Icon className="text-muted-foreground size-4" />
      </CardAction>
      <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
    </CardHeader>
  </Card>
);

export const SalaryDashboard = ({ data }: { data: SalaryData }) => {
  const router = useRouter();
  const refresh = () => {
    router.refresh();
  };
  const previousYear = data.financialYearStart - 1;
  const nextYear = data.financialYearStart + 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            router.push(`/salary?fy=${previousYear}`);
          }}
        >
          ← FY {previousYear}
        </Button>
        <Badge className="px-3" variant="secondary">
          FY {formatFinancialYearLabel(data.financialYearStart)}
        </Badge>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            router.push(`/salary?fy=${nextYear}`);
          }}
        >
          FY {nextYear} →
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={WalletCards}
          title="Received so far"
          value={formatCurrency(data.summary.actualReceived)}
        />
        <SummaryCard
          icon={CalendarClock}
          title="Projected remaining net"
          value={formatCurrency(data.summary.projectedRemainingNet)}
        />
        <SummaryCard
          icon={Landmark}
          title="Projected taxable income"
          value={formatCurrency(data.summary.projectedAnnualTaxableIncome)}
        />
        <SummaryCard
          icon={ReceiptIndianRupee}
          title="Projected total tax"
          value={formatCurrency(data.summary.projectedTotalTax)}
        />
      </div>

      <PayrollTable data={data} refresh={refresh} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <BonusesCard data={data} refresh={refresh} />
        <TaxProjectionCard data={data} />
        <OutsideIncomeCard data={data} />
      </div>
    </div>
  );
};
