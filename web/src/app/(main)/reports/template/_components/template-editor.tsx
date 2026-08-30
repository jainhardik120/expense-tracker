'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/server/react';
import type { ReportInput } from '@/server/reports/report-input';

import type { ReportTemplate } from '@helix-hq/pdf-report';

// Monaco touches `window` on import, so none of this can be server rendered.
const loading = () => <p className="text-muted-foreground p-6 text-sm">Loading editor…</p>;
const Provider = dynamic(
  async () => (await import('@helix-hq/pdf-report/editor')).ReportTemplateProvider,
  { ssr: false, loading },
);
const CodeField = dynamic(
  async () => (await import('@helix-hq/pdf-report/editor')).ReportCodeField,
  { ssr: false, loading },
);
const OutputSchemaField = dynamic(
  async () => (await import('@helix-hq/pdf-report/editor')).ReportOutputSchemaField,
  { ssr: false, loading },
);
const LayoutField = dynamic(
  async () => (await import('@helix-hq/pdf-report/editor')).ReportLayoutField,
  { ssr: false, loading },
);
const Preview = dynamic(async () => (await import('@helix-hq/pdf-report/editor')).ReportPreview, {
  ssr: false,
  loading,
});

// The input schema is fixed by the app, so it is not one of these — it still
// types `input` in the code field, it just is not editable. Preview data is not
// here either: the preview runs on real statements chosen below.
const TABS = [
  { id: 'code', label: 'Code', hint: 'Turns your statements into the values below.' },
  { id: 'output', label: 'Output', hint: 'What the code returns. The layout binds to this.' },
  { id: 'layout', label: 'Layout', hint: 'Where those values are drawn on the page.' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export const TemplateEditor = ({
  template,
  isDefault,
  boundaries,
  initialInput,
  initialFrom,
  initialTo,
}: {
  template: ReportTemplate;
  isDefault: boolean;
  boundaries: { id: string; label: string }[];
  initialInput: ReportInput;
  initialFrom: string;
  initialTo: string;
}) => {
  const [tab, setTab] = useState<TabId>('code');
  const [draft, setDraft] = useState(template);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const router = useRouter();
  const mutation = api.reports.saveTemplate.useMutation();

  // Refetched only when the span changes, and seeded from the server render so
  // the first preview does not wait on a round trip.
  const previewInput = api.reports.getReportInput.useQuery(
    { fromBoundaryId: from, toBoundaryId: to },
    { initialData: from === initialFrom && to === initialTo ? initialInput : undefined },
  );

  const save = async () => {
    try {
      await mutation.mutateAsync({
        inputSchema: draft.inputSchema,
        code: draft.code,
        outputSchema: draft.outputSchema,
        spec: draft.spec,
      });
      toast('Template saved');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const active = TABS.find((entry) => entry.id === tab) ?? TABS[0];

  return (
    <Provider theme="light" value={template} onChange={setDraft} onError={setError}>
      <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Report template</h1>
            <p className="text-muted-foreground text-sm">
              {isDefault
                ? 'You are editing the starting template. Saving makes it yours.'
                : 'Your saved template. The code decides what every number means.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {error !== null && <span className="text-destructive text-sm">{error}</span>}
            <Button disabled={mutation.isPending || error !== null} onClick={save}>
              <Save className="mr-2 size-4" />
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
          <span className="text-muted-foreground text-xs">Preview against</span>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger className="h-8 w-[150px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {boundaries.slice(0, -1).map((boundary) => (
                <SelectItem key={boundary.id} value={boundary.id}>
                  {boundary.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">to</span>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger className="h-8 w-[150px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {boundaries.slice(1).map((boundary) => (
                <SelectItem key={boundary.id} value={boundary.id}>
                  {boundary.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">
            {previewInput.isFetching ? 'Loading your statements…' : 'Your real statements'}
          </span>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
          <div className="bg-background flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border">
            <div className="flex h-10 shrink-0 items-center gap-1 border-b px-1">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  className={
                    entry.id === tab
                      ? 'bg-muted text-foreground rounded px-3 py-1 text-xs font-medium'
                      : 'text-muted-foreground hover:text-foreground rounded px-3 py-1 text-xs'
                  }
                  type="button"
                  onClick={() => {
                    setTab(entry.id);
                  }}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground shrink-0 border-b px-3 py-1.5 text-xs">
              {active.hint}
            </p>
            <div className="min-h-0 flex-1">
              {tab === 'code' && <CodeField />}
              {tab === 'output' && <OutputSchemaField />}
              {tab === 'layout' && <LayoutField />}
            </div>
          </div>

          <div className="bg-background flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border">
            <div className="flex h-10 shrink-0 items-center border-b px-3">
              <span className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
                Preview
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <Preview
                endpoint="/api/pdf-report"
                input={previewInput.data}
                parseError={error}
                renderMode="server"
              />
            </div>
          </div>
        </div>
      </div>
    </Provider>
  );
};
