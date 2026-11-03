import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { DifferenceChart } from './difference-chart';
import { percent, rupees, shortFundName } from './format';
import { type Analysis, signedRupees, toneFor } from './today';

type Benchmark = NonNullable<Analysis['benchmark']>;

const NUMBER_CELL = 'text-right tabular-nums';
const XIRR_DECIMALS = 2;

const xirrLabel = (value: number | null) => (value === null ? '—' : percent(value, XIRR_DECIMALS));

const verdictFor = (difference: number) => {
  if (Math.round(difference) === 0) {
    return 'level with';
  }
  return difference > 0 ? 'ahead of' : 'behind';
};

const ComparisonRow = ({
  label,
  value,
  indexValue,
  xirr,
  indexXirr,
  strong = false,
}: {
  label: string;
  value: number;
  indexValue: number;
  xirr: number | null;
  indexXirr: number | null;
  strong?: boolean;
}) => {
  const difference = value - indexValue;
  return (
    <TableRow className={cn(strong && 'font-medium')}>
      <TableCell className="max-w-48 truncate">{label}</TableCell>
      <TableCell className={NUMBER_CELL}>{rupees(value)}</TableCell>
      <TableCell className={NUMBER_CELL}>{rupees(indexValue)}</TableCell>
      <TableCell className={cn(NUMBER_CELL, toneFor(Math.round(difference)))}>
        {signedRupees(difference)}
      </TableCell>
      <TableCell className={NUMBER_CELL}>
        {xirrLabel(xirr)}
        <span className="text-muted-foreground"> / {xirrLabel(indexXirr)}</span>
      </TableCell>
    </TableRow>
  );
};

export const IndexComparison = ({
  analysis,
  benchmark,
}: {
  analysis: Analysis;
  benchmark: Benchmark;
}) => {
  const difference = benchmark.total.value - benchmark.total.indexValue;
  const funds = analysis.funds.flatMap((fund) => {
    const result = benchmark.funds.find((item) => item.schemeCode === fund.schemeCode);
    return result === undefined ? [] : [{ fund, result }];
  });
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">
          The same rupees on the same dates, put into a Nifty 50 index fund instead. Your funds are{' '}
          <span className={cn('font-medium', toneFor(Math.round(difference)))}>
            {verdictFor(difference)} the index by {rupees(Math.abs(difference))}
          </span>{' '}
          ({xirrLabel(benchmark.total.xirr)} XIRR against {xirrLabel(benchmark.total.indexXirr)}).
        </p>
      </div>
      <DifferenceChart points={benchmark.timeline} />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fund</TableHead>
              <TableHead className="text-right">Your value</TableHead>
              <TableHead className="text-right">In the index</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead className="text-right">XIRR (you / index)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {funds.map(({ fund, result }) => (
              <ComparisonRow
                key={fund.schemeCode}
                indexValue={result.indexValue}
                indexXirr={result.indexXirr}
                label={shortFundName(fund.schemeName)}
                value={fund.value}
                xirr={fund.xirr}
              />
            ))}
            <ComparisonRow
              indexValue={benchmark.total.indexValue}
              indexXirr={benchmark.total.indexXirr}
              label="All your funds"
              strong
              value={benchmark.total.value}
              xirr={benchmark.total.xirr}
            />
          </TableBody>
        </Table>
      </div>
    </section>
  );
};
