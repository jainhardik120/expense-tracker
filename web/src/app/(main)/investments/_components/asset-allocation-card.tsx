'use client';

import { useMemo } from 'react';

import MultiColorPieChart from '@/components/multi-color-pie-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OTHER_SLICE_COLOR } from '@/lib/chart-palette';
import { formatCurrency } from '@/lib/format';
import { assetClassLabels, type AssetClassValue } from '@/lib/investments';
import { type RouterOutput } from '@/server/routers';

type AssetAllocation =
  RouterOutput['investments']['getInvestmentsInitialData']['dashboard']['assetAllocation'];

const assetClassColors: Record<AssetClassValue, string> = {
  market: '#2563eb',
  gold: '#f59e0b',
  silver: '#0891b2',
  fd: '#7c3aed',
  crypto: '#059669',
  epfo: '#ea580c',
  other: OTHER_SLICE_COLOR,
};

export const AssetAllocationCard = ({ allocation }: { allocation: AssetAllocation }) => {
  const slices = useMemo(() => {
    const totals = new Map<AssetClassValue, number>();
    for (const entry of allocation) {
      totals.set(entry.assetClass, (totals.get(entry.assetClass) ?? 0) + entry.valuationAmount);
    }
    return [...totals.entries()].map(([assetClass, value]) => ({
      label: assetClassLabels[assetClass],
      value,
      color: assetClassColors[assetClass],
    }));
  }, [allocation]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asset allocation</CardTitle>
      </CardHeader>
      <CardContent>
        <MultiColorPieChart formatValue={(value) => formatCurrency(value)} slices={slices} />
      </CardContent>
    </Card>
  );
};
