import { z } from 'zod';

import { reportInputSchema } from './report-input';

import type { ReportTemplate } from '@helix-hq/pdf-report';

/** Display-ready values. The spec only places these; it computes nothing. */
const outputSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  spentTotal: z.string(),
  periodCount: z.string(),
  categorySeries: z.array(z.object({ label: z.string(), value: z.number() })),
  categoryHeaders: z.array(z.string()),
  categoryRows: z.array(z.array(z.string())),
});

/**
 * The template a user starts from.
 *
 * Deliberately plain: it totals expenses by category and draws them once. What a
 * category *means* to someone — which one is rent, which friend is a monthly
 * transfer home, which tag marks a one-off — is theirs, and belongs in their own
 * template rather than in everybody's starting point.
 *
 * Editing this file changes what a new user begins with. It does not change a
 * template that has already been saved: that is a row in `report_templates`,
 * edited at /reports/template.
 */
const CODE = `type Statement = {
  periodIndex: number;
  date: string;
  amount: number;
  category: string;
  kind: string;
  account: string;
  friend: string;
  tags: string[];
  splitAmount: number;
};
type Period = { index: number; start: string; end: string; label: string };

const periods = input.periods as Period[];
const statements = input.statements as Statement[];

const money = (value: number): string => {
  const negative = value < 0;
  const whole = Math.round(Math.abs(value));
  const digits = String(whole);
  // Indian grouping: last three digits, then pairs.
  let grouped = digits.length > 3 ? digits.slice(-3) : digits;
  let rest = digits.length > 3 ? digits.slice(0, -3) : "";
  while (rest.length > 2) {
    grouped = rest.slice(-2) + "," + grouped;
    rest = rest.slice(0, -2);
  }
  if (rest.length > 0) grouped = rest + "," + grouped;
  return (negative ? "-Rs " : "Rs ") + grouped;
};

// Net of anything a friend owes back on the row, so a shared bill counts only
// your share of it.
const net = (s: Statement) => s.amount - s.splitAmount;

const expenses = statements.filter((s) => s.kind === "expense");
const totals = new Map<string, number>();
for (const statement of expenses) {
  totals.set(statement.category, (totals.get(statement.category) ?? 0) + net(statement));
}

const series = Array.from(totals, ([label, value]) => ({ label: label, value: Math.round(value) }))
  .filter((point) => point.value > 0)
  .sort((left, right) => right.value - left.value);

const total = series.reduce((sum, point) => sum + point.value, 0);
const first = periods.length > 0 ? periods[0].label : "";
const last = periods.length > 0 ? periods[periods.length - 1].label : "";

return {
  title: "Expense Report",
  subtitle: periods.length === 0 ? "No periods selected" : first + "  to  " + last,
  spentTotal: money(total),
  periodCount: String(periods.length),
  categorySeries: series,
  categoryHeaders: ["Category", "Total", "Share"],
  categoryRows: series.map((point) => [
    point.label,
    money(point.value),
    total === 0 ? "0%" : ((point.value / total) * 100).toFixed(1) + "%",
  ]),
};
`;

export const defaultExpenseReportTemplate: ReportTemplate = {
  inputSchema: z.toJSONSchema(reportInputSchema),
  outputSchema: z.toJSONSchema(outputSchema),
  code: CODE,
  demoInput: {
    generatedAt: new Date().toISOString(),
    currency: 'INR',
    periods: [],
    statements: [],
    selfTransfers: [],
    investments: [],
    accounts: [],
    friends: [],
    openingAccountsBalance: 0,
    openingFriendsBalance: 0,
  },
  spec: {
    root: 'doc',
    elements: {
      doc: {
        type: 'Document',
        props: { title: 'Expense report', author: 'Expense Tracker', subject: 'Expense report' },
        children: ['page'],
      },
      page: {
        type: 'Page',
        props: { size: 'A4' },
        children: ['title', 'subtitle', 'summary', 'breakdown'],
      },
      title: {
        type: 'Heading',
        props: { text: { $state: '/title' }, level: 'h1', color: '#09090b' },
        children: [],
      },
      subtitle: {
        type: 'Text',
        props: { text: { $state: '/subtitle' }, fontSize: 10, color: '#3f3f46' },
        children: [],
      },
      summary: { type: 'Section', props: { title: 'Summary' }, children: ['grid'] },
      grid: { type: 'MetricGrid', props: {}, children: ['m-spent', 'm-periods'] },
      'm-spent': {
        type: 'MetricCard',
        props: { label: 'Total spent', value: { $state: '/spentTotal' }, tone: 'accent' },
        children: [],
      },
      'm-periods': {
        type: 'MetricCard',
        props: { label: 'Periods', value: { $state: '/periodCount' } },
        children: [],
      },
      breakdown: {
        type: 'Section',
        props: { title: 'Spending by category' },
        children: ['row'],
      },
      row: { type: 'Row', props: { gap: 12 }, children: ['pie-col', 'table-col'] },
      'pie-col': { type: 'Column', props: { flex: 1 }, children: ['pie'] },
      'table-col': { type: 'Column', props: { flex: 1 }, children: ['table'] },
      pie: {
        type: 'PieChart',
        props: { series: { $state: '/categorySeries' }, width: 232, height: 210, showLegend: true },
        children: [],
      },
      table: {
        type: 'DataTable',
        props: {
          headers: { $state: '/categoryHeaders' },
          rows: { $state: '/categoryRows' },
          columnWidths: ['46%', '30%', '24%'],
          align: ['left', 'right', 'right'],
          fontSize: 8,
          emptyText: 'No expenses in this span.',
        },
        children: [],
      },
    },
  },
};
