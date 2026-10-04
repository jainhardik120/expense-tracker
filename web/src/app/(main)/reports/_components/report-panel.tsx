'use client';

import { Download, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/server/react';
import { MS_PER_MINUTE } from '@/types';

import {
  type Boundary,
  BoundarySelect,
  useBoundaryOptions,
  useReportDownload,
} from './report-controls';
import { useSpanQueryState } from './report-span';
import { ReportView } from './report-view';

import type { Spec } from '@json-render/core';

const REPORT_STALE_MINUTES = 5;
const REPORT_STALE_TIME_MS = REPORT_STALE_MINUTES * MS_PER_MINUTE;

export const ReportPanel = ({ boundaries }: { boundaries: Boundary[] }) => {
  const first = boundaries[0]?.id ?? '';
  const last = boundaries[boundaries.length - 1]?.id ?? '';
  const [span, setSpan] = useSpanQueryState(
    boundaries.map((boundary) => boundary.id),
    { from: first, to: last },
  );
  const { pending, download } = useReportDownload();

  const fromIndex = boundaries.findIndex((boundary) => boundary.id === span.from);
  const toIndex = boundaries.findIndex((boundary) => boundary.id === span.to);
  const valid = fromIndex !== -1 && toIndex !== -1 && toIndex > fromIndex;

  const report = api.reports.renderReport.useQuery(
    { fromBoundaryId: span.from, toBoundaryId: span.to },
    { enabled: valid, staleTime: REPORT_STALE_TIME_MS, refetchOnWindowFocus: false },
  );

  const options = useBoundaryOptions(boundaries);

  if (boundaries.length < 2) {
    return null;
  }

  const body = (() => {
    if (!valid) {
      return (
        <p className="text-muted-foreground text-sm">
          The end boundary must come after the start boundary.
        </p>
      );
    }
    if (report.isPending) {
      return (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }
    if (report.isError) {
      return (
        <Card>
          <CardContent className="text-destructive text-sm">{report.error.message}</CardContent>
        </Card>
      );
    }
    return <ReportView data={report.data.data} spec={report.data.spec as Spec} />;
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-end">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">From:</span>
          <BoundarySelect
            id="panel-from"
            options={options.slice(0, -1)}
            placeholder="Start"
            triggerClassName="w-full min-w-44"
            value={span.from}
            onChange={(from) => {
              setSpan({ from, to: span.to });
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">To:</span>
          <BoundarySelect
            id="panel-to"
            options={options.slice(1)}
            placeholder="End"
            triggerClassName="w-full min-w-44"
            value={span.to}
            onChange={(to) => {
              setSpan({ from: span.from, to });
            }}
          />
        </div>
        <Button
          disabled={report.isFetching}
          variant="outline"
          onClick={() => void report.refetch()}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
        <Button disabled={pending || !valid} onClick={() => void download(span.from, span.to)}>
          <Download className="mr-2 size-4" />
          {pending ? 'Generating…' : 'PDF'}
        </Button>
      </div>
      {body}
    </div>
  );
};
