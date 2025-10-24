'use client';

import LineChart from '@/components/line-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTruncatedDate } from '@/lib/date';
import type { DateRange, DateTruncUnit } from '@/types';

const Expenses = ({
  data,
  unit,
  range,
}: {
  data: { date: Date; expenses: number }[];
  unit: DateTruncUnit;
  range: DateRange;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Expenses</CardTitle>
      <CardDescription>
        From: {formatTruncatedDate(range.start, unit)} To: {formatTruncatedDate(range.end, unit)}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <LineChart
        data={{
          primaryAxis: {
            key: 'date',
            label: 'Date',
          },
          secondaryAxes: {
            expenses: {
              label: 'Amount',
              color: 'var(--chart-5)',
            },
          },
          data: data.map((d) => ({
            date: formatTruncatedDate(d.date, unit),
            expenses: Math.round(d.expenses),
          })),
        }}
      />
    </CardContent>
  </Card>
);

export default Expenses;
