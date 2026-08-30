import { format } from 'date-fns';

import { api } from '@/server/server';

import { TemplateEditor } from './_components/template-editor';

import type { ReportTemplate } from '@helix-hq/pdf-report';

export default async function ReportTemplatePage() {
  const [stored, boundaries] = await Promise.all([
    api.reports.getTemplate(),
    api.reports.getBoundaries(),
  ]);

  if (boundaries.length < 2) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        Add at least two date boundaries before editing the report template — the preview runs on a
        real period.
      </p>
    );
  }

  // The last few periods are enough to exercise every branch of the code without
  // shipping a year of statements into the browser; the picker widens it.
  const recent = boundaries.slice(-4);
  const initialFrom = recent[0].id;
  const initialTo = recent[recent.length - 1].id;
  const initialInput = await api.reports.getReportInput({
    fromBoundaryId: initialFrom,
    toBoundaryId: initialTo,
  });

  const { isDefault, ...template } = stored;

  // zod's generated JSON Schema carries non-plain objects, which React refuses to
  // hand across the server/client boundary. A template is pure data by
  // definition, so serialising it loses nothing.
  const plain = JSON.parse(JSON.stringify(template)) as ReportTemplate;

  return (
    <TemplateEditor
      boundaries={boundaries.map((boundary) => ({
        id: boundary.id,
        label: format(boundary.boundaryDate, 'MMM dd, yyyy'),
      }))}
      initialFrom={initialFrom}
      initialInput={initialInput}
      initialTo={initialTo}
      isDefault={isDefault}
      template={plain}
    />
  );
}
