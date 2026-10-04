import { auth } from '@/lib/auth';
import { getTimezone } from '@/lib/date';
import { reportBranding } from '@/server/reports/branding';
import { renderOneAtATime } from '@/server/reports/render-queue';

export const runtime = 'nodejs';

export const POST = async (request: Request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { resolveReportTemplate } = await import('@helix-hq/pdf-report');
  const { renderReportToBuffer } = await import('@helix-hq/pdf-report/server');

  const body = (await request.json()) as { template: unknown; input?: unknown };
  const template = resolveReportTemplate(body.template);

  const branding = reportBranding(session.user.name, await getTimezone());
  const pdf = await renderOneAtATime(() =>
    renderReportToBuffer(template, { input: body.input, branding }),
  );

  return new Response(Buffer.from(pdf) as unknown as BodyInit, {
    headers: { 'content-type': 'application/pdf' },
  });
};
