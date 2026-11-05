'use client';

import { useMemo } from 'react';

import Modal from '@/components/modal';
import MultiColorPieChart from '@/components/multi-color-pie-chart';

import { assetTypeLabel, rupees } from './format';
import { type Analysis, type Company, type Fund } from './today';

const EQUITY = 'EQUITY';

type Dimension = {
  title: string;
  pick: (company: Company) => string;
};

const DIMENSIONS: Dimension[] = [
  {
    title: 'Industry',
    pick: (company) =>
      company.assetType === EQUITY
        ? (company.industry ?? company.sector)
        : assetTypeLabel(company.assetType),
  },
  {
    title: 'Sector',
    pick: (company) =>
      company.assetType === EQUITY ? company.sector : assetTypeLabel(company.assetType),
  },
  { title: 'Type', pick: (company) => assetTypeLabel(company.assetType) },
  { title: 'Market cap', pick: (company) => company.capBucket },
];

const slicesFor = (holdings: Array<{ company: Company; value: number }>, dimension: Dimension) => {
  const totals = new Map<string, number>();
  for (const { company, value } of holdings) {
    const name = dimension.pick(company);
    totals.set(name, (totals.get(name) ?? 0) + value);
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter(({ value }) => value > 0)
    .toSorted((left, right) => right.value - left.value);
};

export const FundBreakdownDialog = ({
  fund,
  analysis,
  onClose,
}: {
  fund: Fund | null;
  analysis: Analysis;
  onClose: () => void;
}) => {
  const charts = useMemo(() => {
    if (fund === null) {
      return [];
    }
    const holdings = analysis.companies.flatMap((company) =>
      company.funds
        .filter((item) => item.schemeCode === fund.schemeCode)
        .map((item) => ({ company, value: item.value })),
    );
    return DIMENSIONS.map((dimension) => ({
      title: dimension.title,
      slices: slicesFor(holdings, dimension),
    }));
  }, [analysis.companies, fund]);

  return (
    <Modal
      className="sm:max-w-5xl"
      description={
        fund === null
          ? undefined
          : `How your ${rupees(fund.value)} in this fund is spread, from its portfolio of ${String(fund.holdingsCount)} holdings.`
      }
      open={fund !== null}
      setOpen={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={fund === null ? undefined : fund.schemeName}
      trigger={<span className="hidden" />}
    >
      <div className="grid max-h-[75vh] gap-6 overflow-y-auto sm:grid-cols-2">
        {charts.map((chart) => (
          <section key={chart.title} className="flex min-w-0 flex-col gap-2">
            <h4 className="text-sm font-medium">By {chart.title.toLowerCase()}</h4>
            <MultiColorPieChart
              formatValue={rupees}
              slices={chart.slices.map((slice) => ({ label: slice.name, value: slice.value }))}
            />
          </section>
        ))}
      </div>
    </Modal>
  );
};
