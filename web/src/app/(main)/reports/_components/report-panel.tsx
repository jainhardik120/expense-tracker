'use client';

import { useState } from 'react';

import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { api } from '@/server/react';
import { MS_PER_MINUTE } from '@/types';

import { useSpanQueryState } from './report-span';
import { ReportView } from './report-view';

import type { Spec } from '@json-render/core';

const REPORT_STALE_MINUTES = 5;
const REPORT_STALE_TIME_MS = REPORT_STALE_MINUTES * MS_PER_MINUTE;

type Boundary = { id: string; boundaryDate: Date };

export const ReportPanel = ({ boundaries }: { boundaries: Boundary[] }) => {
  const first = boundaries[0]?.id ?? '';
  const last = boundaries[boundaries.length - 1]?.id ?? '';
  const [span, setSpan] = useSpanQueryState(
    boundaries.map((boundary) => boundary.id),
    { from: first, to: last },
  );
  const [pending, setPending] = useState(false);
  const zoned = useZonedFormat();

  const fromIndex = boundaries.findIndex((boundary) => boundary.id === span.from);
  const toIndex = boundaries.findIndex((boundary) => boundary.id === span.to);
  const valid = fromIndex !== -1 && toIndex !== -1 && toIndex > fromIndex;

  const report = api.reports.renderReport.useQuery(
    { fromBoundaryId: span.from, toBoundaryId: span.to },
    { enabled: valid, staleTime: REPORT_STALE_TIME_MS, refetchOnWindowFocus: false },
  );

  const download = async () => {
    setPending(true);
    try {
      const response = await fetch('/api/reports/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromBoundaryId: span.from, toBoundaryId: span.to }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'money-report.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  const options = boundaries.map((boundary) => ({
    id: boundary.id,
    label: zoned(boundary.boundaryDate, 'MMM dd, yyyy'),
  }));

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
          <Select
            value={span.from}
            onValueChange={(from) => {
              setSpan({ from, to: span.to });
            }}
          >
            <SelectTrigger className="w-full min-w-44" id="panel-from">
              <SelectValue placeholder="Start" />
            </SelectTrigger>
            <SelectContent>
              {options.slice(0, -1).map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">To:</span>
          <Select
            value={span.to}
            onValueChange={(to) => {
              setSpan({ from: span.from, to });
            }}
          >
            <SelectTrigger className="w-full min-w-44" id="panel-to">
              <SelectValue placeholder="End" />
            </SelectTrigger>
            <SelectContent>
              {options.slice(1).map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={report.isFetching}
          variant="outline"
          onClick={() => void report.refetch()}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
        <Button disabled={pending || !valid} onClick={download}>
          <Download className="mr-2 size-4" />
          {pending ? 'Generating…' : 'PDF'}
        </Button>
      </div>
      {body}
    </div>
  );
};
