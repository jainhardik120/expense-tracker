'use client';

import { useState } from 'react';

import { format } from 'date-fns';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useStoredSpan } from './report-span';

type Boundary = { id: string; boundaryDate: Date };

export const DownloadReportDialog = ({ boundaries }: { boundaries: Boundary[] }) => {
  // Whatever span was last chosen anywhere in the app, falling back to the
  // whole completed range: the last boundary closes the most recent finished
  // period, so the ongoing month is never half-reported.
  const [span, setSpan] = useStoredSpan(
    boundaries.map((boundary) => boundary.id),
    { from: boundaries[0]?.id ?? '', to: boundaries[boundaries.length - 1]?.id ?? '' },
  );
  const { from, to } = span;
  const [pending, setPending] = useState(false);

  const fromIndex = boundaries.findIndex((boundary) => boundary.id === from);
  const toIndex = boundaries.findIndex((boundary) => boundary.id === to);
  const periodCount = toIndex - fromIndex;
  const periodLabel = periodCount === 1 ? 'period' : 'periods';
  const periodSummary =
    periodCount > 0
      ? `${periodCount} ${periodLabel} will be reported.`
      : 'The end boundary must come after the start boundary.';

  const download = async () => {
    setPending(true);
    try {
      const response = await fetch('/api/reports/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromBoundaryId: from, toBoundaryId: to }),
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
      toast('Report downloaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  const options = boundaries.map((boundary) => ({
    id: boundary.id,
    label: format(boundary.boundaryDate, 'MMM dd, yyyy'),
  }));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileText className="mr-2 size-4" />
          Download PDF Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Download PDF Report</DialogTitle>
          <DialogDescription>
            The report covers whole periods only, so it always starts and ends on a boundary you
            have defined.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="report-from">From boundary</Label>
            <Select value={from} onValueChange={(next) => {
                setSpan({ from: next, to });
              }}>
              <SelectTrigger id="report-from">
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="report-to">To boundary</Label>
            <Select value={to} onValueChange={(next) => {
                setSpan({ from, to: next });
              }}>
              <SelectTrigger id="report-to">
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
          <p className="text-muted-foreground text-sm">{periodSummary}</p>
          <Button disabled={pending || periodCount <= 0} onClick={download}>
            <Download className="mr-2 size-4" />
            {pending ? 'Generating…' : 'Download'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
