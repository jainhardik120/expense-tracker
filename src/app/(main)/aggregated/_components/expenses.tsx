'use client';

import LineChart from '@/components/line-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTruncatedDate } from '@/lib/date';
import type { DateTruncUnit } from '@/types';

export const Expenses = ({
  data,
  unit,
}: {
  data: { date: Date; expenses: number }[];
  unit: DateTruncUnit;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Expenses</CardTitle>
      <CardDescription>January - June 2024</CardDescription>
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
