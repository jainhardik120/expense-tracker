import { getTimezone, zonedFormat } from '@/lib/date';
import { DATE_FORMAT } from '@/lib/format';
import { api } from '@/server/server';

import { TemplateEditor } from './_components/template-editor';

import type { ReportTemplate } from '@helix-hq/pdf-report';

const PREVIEW_PERIOD_COUNT = 4;

export default async function ReportTemplatePage() {
  const timezone = await getTimezone();
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

  const recent = boundaries.slice(-PREVIEW_PERIOD_COUNT);
  const initialFrom = recent[0].id;
  const initialTo = recent[recent.length - 1].id;
  const initialInput = await api.reports.getReportInput({
    fromBoundaryId: initialFrom,
    toBoundaryId: initialTo,
  });

  const { isDefault, ...template } = stored;

  const plain = JSON.parse(JSON.stringify(template)) as ReportTemplate;

  return (
    <TemplateEditor
      boundaries={boundaries.map((boundary) => ({
        id: boundary.id,
        label: zonedFormat(boundary.boundaryDate, DATE_FORMAT.date, timezone),
      }))}
      initialFrom={initialFrom}
      initialInput={initialInput}
      initialTo={initialTo}
      isDefault={isDefault}
      template={plain}
    />
  );
}
