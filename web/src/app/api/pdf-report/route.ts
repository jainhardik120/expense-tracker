import { auth } from '@/lib/auth';

// react-pdf and the json-render registry are Node-only.
export const runtime = 'nodejs';

/**
 * The editor's preview route. It is handed a template and an input and renders
 * them; it deliberately does not read the database, so a preview goes through
 * exactly the same path as a delivered report.
 */
export const POST = async (request: Request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { resolveReportTemplate } = await import('@helix-hq/pdf-report');
  const { renderReportToBuffer } = await import('@helix-hq/pdf-report/server');

  const body = (await request.json()) as { template: unknown; input?: unknown };
  const template = resolveReportTemplate(body.template);

  const pdf = await renderReportToBuffer(template, {
    input: body.input,
    branding: {
      title: 'Expense Tracker',
      subtitle: session.user.name,
      generatedAt: new Date().toUTCString(),
    },
  });

  return new Response(Buffer.from(pdf) as unknown as BodyInit, {
    headers: { 'content-type': 'application/pdf' },
  });
};
