import { z } from 'zod';

import { reportInputSchema } from './report-input';

import type { ReportTemplate } from '@helix-hq/pdf-report';

/** How many month blocks the layout defines; the code pads to this. */
const MAX_MONTHS = 18;

const seriesSchema = z.array(z.object({ label: z.string(), value: z.number() }));

/** Display-ready values. The spec only places these; it computes nothing. */
const outputSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  salaryTotal: z.string(),
  motherTotal: z.string(),
  investedTotal: z.string(),
  expenditureTotal: z.string(),
  rentTotal: z.string(),
  oneOffTotal: z.string(),
  reconciliationNote: z.string(),
  periodHeaders: z.array(z.string()),
  periodRows: z.array(z.array(z.string())),
  spendSeries: seriesSchema,
  oneOffHeaders: z.array(z.string()),
  oneOffRows: z.array(z.array(z.string())),
  oneOffNote: z.string(),
  monthCount: z.number(),
  monthHeaders: z.array(z.string()),
  months: z.array(
    z.object({
      label: z.string(),
      pie: seriesSchema,
      rows: z.array(z.array(z.string())),
      rowColors: z.array(z.string().nullable()),
    }),
  ),
  shoppingHeaders: z.array(z.string()),
  shoppingRows: z.array(z.array(z.string())),
  shoppingNote: z.string(),
  totalHeaders: z.array(z.string()),
  totalRows: z.array(z.array(z.string())),
  totalSeries: seriesSchema,
});

/**
 * The starting code step. Everything personal lives here — which category is
 * salary, which friend is the monthly transfer home, which tags earn their own
 * line — so it can be edited per user without touching the app.
 */
const CODE = `// ---- Your rules. Edit these; the rest follows from them. -------------------
const SALARY_CATEGORY = "Salary";
const MOTHER = "Mummy";
const INVESTMENT_CATEGORY = "Investment";
const RENT_CATEGORY = "House";
const ONE_OFF_TAGS = ["flight"];
// A trip is spread over dozens of item-level tags ("Hotel Goa", "Cruise"), and
// often over two periods, so it is separated by category rather than by tag.
const ONE_OFF_CATEGORIES = ["Trip"];
// Tags that earn their own line instead of disappearing into their category.
// A holiday package booked under "Extra" tells you nothing sitting inside
// "Extra"; on its own line it is the largest thing you buy.
const SPLIT_OUT_TAGS = ["Holiday Package", "Gym EMI"];
// The category the end-of-report itemised table covers.
const SHOPPING_CATEGORY = "Shopping";
// A tag matching this is an instalment plan, so its rows collapse to one line
// rather than repeating the same purchase every month.
const EMI_PATTERN = "emi";
// How many individual items each month lists before the rest is grouped.
const TOP_PER_MONTH = 5;
// How many item names a grouped row names in passing, largest first.
const CHIPS_PER_GROUP = 3;
// Must match the number of month blocks the layout defines.
const MAX_MONTHS = 18;

type Statement = {
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
type Period = { index: number; start: string; end: string; label: string; note: string };

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

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

// Net of what someone else owes back on the row. Rent is shared with a flatmate
// and recorded gross, so only the split-adjusted figure is what you actually
// paid — the same is true of any shared bill.
const net = (s: Statement) => s.amount - s.splitAmount;
const isRent = (s: Statement) => s.category === RENT_CATEGORY;
const isOneOff = (s: Statement) =>
  ONE_OFF_CATEGORIES.indexOf(s.category) !== -1 ||
  s.tags.some((tag) => ONE_OFF_TAGS.indexOf(tag.toLowerCase()) !== -1);
const oneOffLabel = (s: Statement) => {
  if (ONE_OFF_CATEGORIES.indexOf(s.category) !== -1) return s.category;
  const hit = s.tags.filter((tag) => ONE_OFF_TAGS.indexOf(tag.toLowerCase()) !== -1);
  return hit.length > 0 ? hit[0] : s.category;
};
const primaryTag = (s: Statement) => (s.tags.length > 0 ? s.tags[0] : s.category);
// The bucket a row is counted under: its own line if it carries a split-out tag,
// otherwise its native category.
const bucketOf = (s: Statement) => {
  for (const tag of s.tags) {
    for (const want of SPLIT_OUT_TAGS) {
      if (tag.toLowerCase() === want.toLowerCase()) return want;
    }
  }
  return s.category;
};

const descending = (a: { value: number }, b: { value: number }) => b.value - a.value;
const toSeries = (totals: Map<string, number>) =>
  Array.from(totals, ([label, value]) => ({ label: label, value: Math.round(value) }))
    .filter((point) => point.value > 0)
    .sort(descending);

const periodRows: string[][] = [];
const spendSeries: { label: string; value: number }[] = [];
const oneOffRows: string[][] = [];
const months: unknown[] = [];
const overall = new Map<string, number>();
const shopping: Statement[] = [];

let salaryTotal = 0;
let motherTotal = 0;
let investedTotal = 0;
let rentTotal = 0;
let expenditureTotal = 0;
let oneOffTotal = 0;

for (const period of periods) {
  const rowsIn = statements.filter((s) => s.periodIndex === period.index);
  const expenseRows = rowsIn.filter((s) => s.kind === "expense");

  const salary = sum(
    rowsIn
      .filter((s) => s.category === SALARY_CATEGORY && s.kind === "outside_transaction")
      .map((s) => s.amount),
  );
  const mother = sum(
    rowsIn
      .filter(
        (s) =>
          s.friend === MOTHER && s.category === SALARY_CATEGORY && s.kind === "friend_transaction",
      )
      .map((s) => s.amount),
  );
  // Investment outside transactions are recorded negative (money leaving), so
  // negate to report a positive "invested" figure.
  const invested = -sum(
    rowsIn
      .filter((s) => s.category === INVESTMENT_CATEGORY && s.kind === "outside_transaction")
      .map((s) => s.amount),
  );

  const rent = sum(expenseRows.filter(isRent).map(net));
  const oneOffRowsIn = expenseRows.filter((s) => isOneOff(s) && !isRent(s));
  const routineIn = expenseRows.filter((s) => !isOneOff(s) && !isRent(s));
  const oneOffSpend = sum(oneOffRowsIn.map(net));
  const spent = sum(routineIn.map(net));

  salaryTotal += salary;
  motherTotal += mother;
  investedTotal += invested;
  rentTotal += rent;
  expenditureTotal += spent;
  oneOffTotal += oneOffSpend;

  periodRows.push([
    period.label,
    money(salary),
    money(mother),
    money(invested),
    money(rent),
    money(spent),
    money(oneOffSpend),
  ]);
  spendSeries.push({ label: period.label.slice(0, 6), value: Math.round(spent) });

  // One-offs are summarised per period and per marker, not itemised: the point
  // is which trip or flight the money went to, not each cab within it.
  const byLabel = new Map<string, number>();
  for (const statement of oneOffRowsIn) {
    const label = oneOffLabel(statement);
    byLabel.set(label, (byLabel.get(label) ?? 0) + net(statement));
  }
  for (const label of Array.from(byLabel.keys()).sort()) {
    oneOffRows.push([period.label, label, money(byLabel.get(label) ?? 0)]);
  }

  // The month's own split, by bucket.
  const monthBuckets = new Map<string, number>();
  for (const statement of routineIn) {
    if (statement.category === SHOPPING_CATEGORY) shopping.push(statement);
    const bucket = bucketOf(statement);
    monthBuckets.set(bucket, (monthBuckets.get(bucket) ?? 0) + net(statement));
    overall.set(bucket, (overall.get(bucket) ?? 0) + net(statement));
  }

  // Named items first, then whatever is left of each bucket. Seeing "Desk
  // Rs 4,104" is the point; seeing "Shopping Rs 9,200" is not.
  const ranked = routineIn.slice().sort((left, right) => net(right) - net(left));
  const top = ranked.slice(0, TOP_PER_MONTH).filter((s) => net(s) > 0);

  // What is left of each bucket once the named items are taken out, and which
  // items make up most of it — a bare "Shopping Rs 5,075" says nothing about
  // what was actually bought.
  const restTotals = new Map<string, number>();
  const restItems = new Map<string, Map<string, number>>();
  for (const statement of routineIn) {
    if (top.indexOf(statement) !== -1) continue;
    const bucket = bucketOf(statement);
    restTotals.set(bucket, (restTotals.get(bucket) ?? 0) + net(statement));
    const inner = restItems.get(bucket) ?? new Map<string, number>();
    const tag = primaryTag(statement);
    inner.set(tag, (inner.get(tag) ?? 0) + net(statement));
    restItems.set(bucket, inner);
  }

  const monthRows: string[][] = [];
  const monthColors: (string | null)[] = [];
  for (const statement of top) {
    monthRows.push([primaryTag(statement), bucketOf(statement), money(net(statement))]);
    monthColors.push("#f1f5f9");
  }
  for (const entry of toSeries(restTotals)) {
    const inner = restItems.get(entry.label) ?? new Map<string, number>();
    const chips = Array.from(inner, ([tag, value]) => ({ tag: tag, value: value }))
      .sort(descending)
      .slice(0, CHIPS_PER_GROUP)
      .map((item) => item.tag)
      .join("  ·  ");
    monthRows.push([entry.label, chips, money(entry.value)]);
    monthColors.push(null);
  }

  months.push({
    label: period.label + "   ·   " + money(spent),
    pie: toSeries(monthBuckets),
    rows: monthRows,
    rowColors: monthColors,
  });
}

// The layout defines a fixed number of blocks and hides the unused ones, so the
// array has to be padded to that length for the bindings to resolve.
const monthCount = months.length;
while (months.length < MAX_MONTHS) {
  months.push({ label: "", pie: [], rows: [], rowColors: [] });
}

// Every shopping line, largest first, with instalment plans folded into one row
// each — three months of "Tab EMI" is one purchase, not three.
const isEmi = (s: Statement) => primaryTag(s).toLowerCase().indexOf(EMI_PATTERN) !== -1;
const emiGroups = new Map<string, { total: number; count: number }>();
const shoppingSingles: Statement[] = [];
for (const statement of shopping) {
  if (isEmi(statement)) {
    const key = primaryTag(statement);
    const seen = emiGroups.get(key) ?? { total: 0, count: 0 };
    emiGroups.set(key, { total: seen.total + net(statement), count: seen.count + 1 });
    continue;
  }
  shoppingSingles.push(statement);
}
const shoppingEntries = [
  ...Array.from(emiGroups, ([tag, value]) => ({
    label: tag,
    when: value.count + (value.count === 1 ? " instalment" : " instalments"),
    value: value.total,
  })),
  ...shoppingSingles.map((s) => ({
    label: primaryTag(s),
    when: s.date.slice(0, 10),
    value: net(s),
  })),
].sort(descending);
const shoppingTotal = sum(shoppingEntries.map((entry) => entry.value));
const shoppingRows = shoppingEntries.map((entry) => [
  entry.label,
  entry.when,
  money(entry.value),
]);

const overallSeries = toSeries(overall);
const totalRows = overallSeries.map((entry) => [
  entry.label,
  money(entry.value),
  money(monthCount === 0 ? 0 : entry.value / monthCount),
]);

const first = periods.length > 0 ? periods[0].label : "";
const last = periods.length > 0 ? periods[periods.length - 1].label : "";
return {
  title: "Money Report",
  subtitle: periods.length === 0 ? "No periods selected" : first + "  to  " + last,
  salaryTotal: money(salaryTotal),
  motherTotal: money(motherTotal),
  investedTotal: money(investedTotal),
  expenditureTotal: money(expenditureTotal),
  rentTotal: money(rentTotal),
  oneOffTotal: money(oneOffTotal),
  reconciliationNote:
    "Spent is your routine spending: expense rows net of splits, with rent and one-offs taken out. Rent is your share after the flat split.",
  periodHeaders: ["Period", "Salary", "Home", "Invested", "Rent", "Spent", "One-offs"],
  periodRows: periodRows,
  spendSeries: spendSeries,
  oneOffHeaders: ["Period", "What", "Amount"],
  oneOffRows: oneOffRows,
  oneOffNote:
    oneOffRows.length === 0
      ? ""
      : "One-offs total " +
        money(oneOffTotal) +
        " and are excluded from Spent and from the monthly splits.",
  monthCount: monthCount,
  months: months,
  monthHeaders: ["What", "Detail", "Amount"],
  shoppingHeaders: ["Item", "When", "Amount"],
  shoppingRows: shoppingRows,
  shoppingNote:
    shoppingRows.length === 0
      ? ""
      : shoppingRows.length +
        " shopping line(s) totalling " +
        money(shoppingTotal) +
        ". Instalment plans are folded into one row each.",
  totalHeaders: ["Group", "Total", "Per month"],
  totalRows: totalRows,
  totalSeries: overallSeries,
};
`;

/**
 * One block per month: the split on the left, what it was spent on to the right.
 *
 * A spec is static JSON but the number of months is not, so the blocks are
 * generated here and the unused ones hide themselves — `visible` compares the
 * block's own index against the count the code reports.
 */
const monthBlocks = () => {
  const elements: Record<string, unknown> = {};
  const keys: string[] = [];
  for (let index = 0; index < MAX_MONTHS; index++) {
    const block = `month-${index}`;
    const section = `${block}-section`;
    const row = `${block}-row`;
    const pieCol = `${block}-pie-col`;
    const tableCol = `${block}-table-col`;
    keys.push(block);
    // Wrapped so a month's chart and table never land on opposite sides of a
    // page break, which splits the one comparison the block exists to make.
    elements[block] = {
      type: 'KeepTogether',
      props: { marginBottom: 8 },
      children: [section],
      visible: { $state: '/monthCount', gt: index },
    };
    elements[section] = {
      type: 'Section',
      props: { title: { $state: `/months/${index}/label` } },
      children: [row],
    };
    elements[row] = { type: 'Row', props: { gap: 12 }, children: [pieCol, tableCol] };
    elements[pieCol] = { type: 'Column', props: { flex: 1 }, children: [`${block}-pie`] };
    elements[tableCol] = { type: 'Column', props: { flex: 1 }, children: [`${block}-table`] };
    elements[`${block}-pie`] = {
      type: 'PieChart',
      props: {
        series: { $state: `/months/${index}/pie` },
        width: 232,
        height: 200,
        showLegend: true,
      },
      children: [],
    };
    elements[`${block}-table`] = {
      type: 'DataTable',
      props: {
        headers: { $state: '/monthHeaders' },
        rows: { $state: `/months/${index}/rows` },
        rowColors: { $state: `/months/${index}/rowColors` },
        // The detail column carries the item names now, so it needs the room;
        // narrower and it hyphenates mid-word.
        columnWidths: ['30%', '44%', '26%'],
        align: ['left', 'left', 'right'],
        fontSize: 7,
        emptyText: 'Nothing spent this month.',
      },
      children: [],
    };
  }
  return { elements, keys };
};

const { elements: monthElements, keys: monthKeys } = monthBlocks();

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
    openingBalance: 0,
  },
  spec: {
    root: 'doc',
    elements: {
      doc: {
        type: 'Document',
        props: { title: 'Money report', author: 'Expense Tracker', subject: 'Money report' },
        children: ['page'],
      },
      page: {
        type: 'Page',
        props: { size: 'A4' },
        children: [
          'title',
          'subtitle',
          'summary',
          'reconciliation',
          'trend',
          'periods',
          ...monthKeys,
          'totals',
          'shopping',
          'oneoffs',
        ],
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
      summary: { type: 'Section', props: { title: 'Where the money went' }, children: ['grid'] },
      grid: {
        type: 'MetricGrid',
        props: {},
        children: ['m-salary', 'm-home', 'm-invested', 'm-rent', 'm-spent', 'm-oneoff'],
      },
      'm-salary': {
        type: 'MetricCard',
        props: { label: 'Salary', value: { $state: '/salaryTotal' }, tone: 'accent' },
        children: [],
      },
      'm-home': {
        type: 'MetricCard',
        props: { label: 'Sent home', value: { $state: '/motherTotal' } },
        children: [],
      },
      'm-invested': {
        type: 'MetricCard',
        props: { label: 'Invested', value: { $state: '/investedTotal' }, tone: 'success' },
        children: [],
      },
      'm-rent': {
        type: 'MetricCard',
        props: { label: 'Rent (your share)', value: { $state: '/rentTotal' } },
        children: [],
      },
      'm-spent': {
        type: 'MetricCard',
        props: { label: 'Spent', value: { $state: '/expenditureTotal' }, tone: 'warning' },
        children: [],
      },
      'm-oneoff': {
        type: 'MetricCard',
        props: { label: 'One-offs', value: { $state: '/oneOffTotal' }, tone: 'danger' },
        children: [],
      },
      reconciliation: {
        type: 'Callout',
        props: { text: { $state: '/reconciliationNote' }, tone: 'info' },
        children: [],
      },
      trend: { type: 'Section', props: { title: 'Routine spend per period' }, children: ['chart'] },
      chart: {
        type: 'BarChart',
        props: { series: { $state: '/spendSeries' }, width: 500, height: 170, showValues: true },
        children: [],
      },
      periods: { type: 'Section', props: { title: 'Period breakdown' }, children: ['ptable'] },
      ptable: {
        type: 'DataTable',
        props: {
          headers: { $state: '/periodHeaders' },
          rows: { $state: '/periodRows' },
          columnWidths: ['26%', '13%', '12%', '13%', '12%', '12%', '12%'],
          align: ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
          fontSize: 8,
        },
        children: [],
      },
      ...monthElements,
      totals: {
        type: 'KeepTogether',
        props: { marginBottom: 8 },
        children: ['totals-section'],
      },
      'totals-section': {
        type: 'Section',
        props: {
          title: 'Everything, grouped',
          subtitle: 'Routine spending across every period in this report',
        },
        children: ['totals-row'],
      },
      'totals-row': {
        type: 'Row',
        props: { gap: 12 },
        children: ['totals-pie-col', 'totals-table-col'],
      },
      'totals-pie-col': { type: 'Column', props: { flex: 1 }, children: ['totals-pie'] },
      'totals-table-col': { type: 'Column', props: { flex: 1 }, children: ['totals-table'] },
      'totals-pie': {
        type: 'PieChart',
        props: { series: { $state: '/totalSeries' }, width: 232, height: 210, showLegend: true },
        children: [],
      },
      'totals-table': {
        type: 'DataTable',
        props: {
          headers: { $state: '/totalHeaders' },
          rows: { $state: '/totalRows' },
          columnWidths: ['44%', '28%', '28%'],
          align: ['left', 'right', 'right'],
          fontSize: 7,
          emptyText: 'No routine spending in this span.',
        },
        children: [],
      },
      // Deliberately not wrapped in KeepTogether: this table runs to dozens of
      // rows, and forcing it onto one page overlaps them instead of paginating.
      shopping: {
        type: 'Section',
        props: {
          title: 'Every shopping line',
          subtitle: 'Largest first, instalment plans grouped',
        },
        children: ['shopping-note', 'shopping-table'],
      },
      'shopping-note': {
        type: 'Callout',
        props: { text: { $state: '/shoppingNote' }, tone: 'info' },
        children: [],
      },
      'shopping-table': {
        type: 'DataTable',
        props: {
          headers: { $state: '/shoppingHeaders' },
          rows: { $state: '/shoppingRows' },
          columnWidths: ['48%', '28%', '24%'],
          align: ['left', 'left', 'right'],
          fontSize: 7,
          emptyText: 'No shopping in this span.',
        },
        children: [],
      },
      oneoffs: {
        type: 'Section',
        props: { title: 'One-offs', subtitle: 'Summarised per period, not itemised' },
        children: ['oneoff-note', 'otable'],
      },
      'oneoff-note': {
        type: 'Callout',
        props: { text: { $state: '/oneOffNote' }, tone: 'warning' },
        children: [],
      },
      otable: {
        type: 'DataTable',
        props: {
          headers: { $state: '/oneOffHeaders' },
          rows: { $state: '/oneOffRows' },
          columnWidths: ['40%', '35%', '25%'],
          align: ['left', 'left', 'right'],
          fontSize: 8,
          emptyText: 'No one-offs in this span.',
        },
        children: [],
      },
    },
  },
};
