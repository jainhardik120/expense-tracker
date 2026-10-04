'use client';

import { Download, FileText } from 'lucide-react';

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
  type Boundary,
  BoundarySelect,
  useBoundaryOptions,
  useReportDownload,
} from './report-controls';
import { useStoredSpan } from './report-span';

export const DownloadReportDialog = ({ boundaries }: { boundaries: Boundary[] }) => {
  const [span, setSpan] = useStoredSpan(
    boundaries.map((boundary) => boundary.id),
    { from: boundaries[0]?.id ?? '', to: boundaries[boundaries.length - 1]?.id ?? '' },
  );
  const { from, to } = span;
  const { pending, download } = useReportDownload('Report downloaded');

  const fromIndex = boundaries.findIndex((boundary) => boundary.id === from);
  const toIndex = boundaries.findIndex((boundary) => boundary.id === to);
  const periodCount = toIndex - fromIndex;
  const periodLabel = periodCount === 1 ? 'period' : 'periods';
  const periodSummary =
    periodCount > 0
      ? `${periodCount} ${periodLabel} will be reported.`
      : 'The end boundary must come after the start boundary.';

  const options = useBoundaryOptions(boundaries);

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
            <BoundarySelect
              id="report-from"
              options={options.slice(0, -1)}
              placeholder="Start"
              value={from}
              onChange={(next) => {
                setSpan({ from: next, to });
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="report-to">To boundary</Label>
            <BoundarySelect
              id="report-to"
              options={options.slice(1)}
              placeholder="End"
              value={to}
              onChange={(next) => {
                setSpan({ from, to: next });
              }}
            />
          </div>
          <p className="text-muted-foreground text-sm">{periodSummary}</p>
          <Button disabled={pending || periodCount <= 0} onClick={() => void download(from, to)}>
            <Download className="mr-2 size-4" />
            {pending ? 'Generating…' : 'Download'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
