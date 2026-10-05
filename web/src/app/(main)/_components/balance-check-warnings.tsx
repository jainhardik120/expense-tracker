import Link from 'next/link';

import { TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import { type RouterOutput } from '@/server/routers';

type Warning = RouterOutput['balanceChecks']['getWarnings'][number];

const earlierChecks = (count: number) =>
  count === 1 ? '1 earlier check does' : `${count} earlier checks do`;

const describe = (warning: Warning) =>
  warning.latestDifference === 0
    ? `${warning.accountName}: matches now, but ${earlierChecks(warning.mismatchedChecks)} not`
    : `${warning.accountName}: off by ${formatCurrency(warning.latestDifference)} from your last check`;

export const BalanceCheckWarnings = ({ warnings }: { warnings: Warning[] }) => {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <div className="border-destructive/40 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="flex items-start gap-3">
        <TriangleAlert className="text-destructive mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">
            {warnings.length === 1
              ? 'An account balance is incorrect'
              : `${warnings.length} account balances are incorrect`}
          </span>
          <span className="text-muted-foreground text-sm">
            {warnings.map(describe).join(' · ')}
          </span>
        </div>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href="/balance-checks">Fix balances</Link>
      </Button>
    </div>
  );
};
