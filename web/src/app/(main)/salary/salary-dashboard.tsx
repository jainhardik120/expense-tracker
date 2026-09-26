'use client';

import { useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  BadgeIndianRupee,
  CalendarClock,
  Landmark,
  Plus,
  ReceiptIndianRupee,
  Settings2,
  SquarePen,
  Trash2,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import Modal from '@/components/modal';
import MutationModal from '@/components/mutation-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/format';
import { hasMaterialSalaryNetMismatch } from '@/lib/salary';
import { api } from '@/server/react';
import type { RouterOutput } from '@/server/routers';
import {
  createSalaryBonusSchema,
  createSalaryComponentSchema,
  createSalaryRevisionSchema,
  type SalaryPaymentLineInput,
  updateSalaryPaymentSchema,
  updateSalaryTaxSettingsSchema,
} from '@/types';

import type { z } from 'zod';

type SalaryData = RouterOutput['salary']['getPageData'];
type SalaryRow = SalaryData['rows'][number];
type SalaryComponent = SalaryData['components'][number];
type SalaryRevision = SalaryData['revisions'][number];
type CreateComponentInput = z.input<typeof createSalaryComponentSchema>;
type CreateRevisionInput = z.input<typeof createSalaryRevisionSchema>;
type RevisionComponentInput = CreateRevisionInput['components'][number];
type CreateBonusInput = z.input<typeof createSalaryBonusSchema>;
type TaxSettingsInput = z.input<typeof updateSalaryTaxSettingsSchema>;
type UpdatePaymentInput = z.input<typeof updateSalaryPaymentSchema>;

const DEFAULT_PAY_DAY = 25;
const NOON = 12;

/**
 * A date that means a calendar day, pinned to noon UTC.
 *
 * Effective dates, pay dates and expected dates are days rather than instants,
 * and noon is far enough from both midnights that no reader's timezone shifts
 * them onto the day before or after.
 */
const asCalendarDay = (date: Date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), NOON));
const classificationLabels = {
  regular: 'Regular',
  tax_withholding: 'TDS / tax withheld',
  provident_fund: 'Provident fund',
  other: 'Other',
};

const statusPresentation = {
  actual: { label: 'Actual', variant: 'default' as const },
  forecast: { label: 'Forecast', variant: 'secondary' as const },
  awaiting: { label: 'Awaiting link', variant: 'outline' as const },
};

const formatSignedCurrency = (value: number) =>
  `${value >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(value))}`;

const getProjectedTdsPositionLabel = (position: number) => {
  if (position === 0) {
    return 'Projected TDS matches tax';
  }
  return position > 0 ? 'Estimated TDS surplus' : 'Estimated tax shortfall';
};

const FormField = ({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    {children}
    {hint === undefined ? null : <p className="text-muted-foreground text-xs">{hint}</p>}
  </div>
);

const SummaryCard = ({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
}) => (
  <Card className="gap-3 py-5">
    <CardHeader className="px-5">
      <CardDescription>{title}</CardDescription>
      <CardAction>
        <Icon className="text-muted-foreground size-4" />
      </CardAction>
      <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
    </CardHeader>
    <CardContent className="text-muted-foreground px-5 text-xs">{description}</CardContent>
  </Card>
);

const componentFields: FormField<CreateComponentInput>[] = [
  { name: 'name', label: 'Name', type: 'input', placeholder: 'Basic pay' },
  {
    name: 'kind',
    label: 'Direction',
    type: 'select',
    options: [
      { label: 'Earning', value: 'earning' },
      { label: 'Deduction', value: 'deduction' },
    ],
  },
  {
    name: 'frequency',
    label: 'Frequency',
    type: 'select',
    options: [
      { label: 'Monthly', value: 'monthly' },
      { label: 'One time / bonus', value: 'one_time' },
    ],
  },
  {
    name: 'classification',
    label: 'Classification',
    type: 'select',
    options: Object.entries(classificationLabels).map(([value, label]) => ({ label, value })),
  },
  { name: 'affectsTaxableIncome', label: 'Affects taxable salary', type: 'checkbox' },
  { name: 'proratable', label: 'Prorate for partial month', type: 'checkbox' },
];

const componentDefaults: CreateComponentInput = {
  name: '',
  kind: 'earning',
  frequency: 'monthly',
  classification: 'regular',
  affectsTaxableIncome: true,
  proratable: true,
};

const ComponentDialog = ({ onSaved }: { onSaved: () => void }) => {
  const mutation = api.salary.createComponent.useMutation();
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          <Plus /> Component
        </Button>
      }
      defaultValues={componentDefaults}
      fields={componentFields}
      modalDescription="Components can be reused across salary revisions and actual breakdowns."
      mutation={mutation}
      refresh={onSaved}
      schema={createSalaryComponentSchema}
      submitButtonText="Create component"
      successToast={() => 'Salary component created'}
      titleText="New salary component"
    />
  );
};

/**
 * The amount of every monthly component, as one field.
 *
 * The schema wants the components that were actually given an amount, which is
 * a single array value rather than one field per component -- so it renders
 * through the form kit's `custom` type instead of being pulled out of the form.
 */
const RevisionComponentAmounts = ({
  components,
  value,
  onChange,
}: {
  components: SalaryComponent[];
  value: RevisionComponentInput[];
  onChange: (value: RevisionComponentInput[]) => void;
}) => {
  const amountOf = (componentId: string) =>
    value.find((entry) => entry.componentId === componentId)?.amount ?? '';
  const setAmount = (componentId: string, amount: string) => {
    const without = value.filter((entry) => entry.componentId !== componentId);
    onChange(amount.trim() === '' ? without : [...without, { componentId, amount }]);
  };

  if (components.length === 0) {
    return <p className="text-muted-foreground text-sm">Create monthly components first.</p>;
  }
  return (
    <div className="space-y-3">
      {components.map((component) => (
        <div key={component.id} className="grid grid-cols-[1fr_10rem] items-center gap-3">
          <div>
            <p className="text-sm font-medium">{component.name}</p>
            <p className="text-muted-foreground text-xs">
              {component.kind} · {classificationLabels[component.classification]}
            </p>
          </div>
          <Input
            inputMode="decimal"
            placeholder="0"
            value={amountOf(component.id)}
            onChange={(event) => {
              setAmount(component.id, event.target.value);
            }}
          />
        </div>
      ))}
    </div>
  );
};

const revisionFields = (monthly: SalaryComponent[]): FormField<CreateRevisionInput>[] => [
  { name: 'name', label: 'Revision name', type: 'input', placeholder: 'Current salary' },
  { name: 'effectiveFrom', label: 'Effective from', type: 'date' },
  { name: 'payDay', label: 'Usual pay day', type: 'integer', min: 1, max: 31 },
  {
    name: 'payDateRule',
    label: 'Weekend handling',
    type: 'select',
    options: [
      { label: 'Previous weekday', value: 'previous_weekday' },
      { label: 'Exact date', value: 'exact' },
    ],
  },
  {
    name: 'components',
    label: 'Monthly components',
    type: 'custom',
    description: 'Leave an amount blank to exclude it.',
    render: (field) => (
      <RevisionComponentAmounts
        components={monthly}
        value={field.value as RevisionComponentInput[]}
        onChange={field.onChange}
      />
    ),
  },
];

const revisionDefaults = (revision: SalaryRevision | undefined): CreateRevisionInput => ({
  name: revision?.name ?? 'Current salary',
  effectiveFrom: revision?.effectiveFrom ?? new Date(),
  payDay: revision?.payDay ?? DEFAULT_PAY_DAY,
  payDateRule: revision?.payDateRule ?? 'previous_weekday',
  components:
    revision?.components.map((component) => ({
      componentId: component.componentId,
      amount: component.amount,
    })) ?? [],
});

const RevisionDialog = ({
  components,
  onSaved,
  revision,
}: {
  components: SalaryComponent[];
  onSaved: () => void;
  revision?: SalaryRevision;
}) => {
  const monthly = components.filter((component) => component.frequency === 'monthly');
  const createMutation = api.salary.createRevision.useMutation();
  const updateMutation = api.salary.updateRevision.useMutation();
  const isEditing = revision !== undefined;
  const mutation = {
    isPending: createMutation.isPending || updateMutation.isPending,
    mutateAsync: async (values: CreateRevisionInput) => {
      const input = { ...values, effectiveFrom: asCalendarDay(values.effectiveFrom) };
      return revision === undefined
        ? createMutation.mutateAsync(input)
        : updateMutation.mutateAsync({ id: revision.id, ...input });
    },
  };

  return (
    <MutationModal
      button={
        isEditing ? (
          <Button
            aria-label={`Edit ${revision.name}`}
            size="icon"
            title="Edit revision"
            variant="ghost"
          >
            <SquarePen />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Revision
          </Button>
        )
      }
      defaultValues={revisionDefaults(revision)}
      fields={revisionFields(monthly)}
      modalClassName="sm:max-w-2xl"
      modalDescription={
        isEditing
          ? 'Update this future salary structure. Linked payroll records remain immutable.'
          : 'Use a new effective date for increments, job switches, or any fixed-pay change.'
      }
      mutation={mutation}
      refresh={onSaved}
      schema={createSalaryRevisionSchema}
      submitButtonDisabled={monthly.length === 0}
      submitButtonText={isEditing ? 'Save revision' : 'Create revision'}
      successToast={() => (isEditing ? 'Salary revision updated' : 'Salary revision created')}
      titleText={isEditing ? 'Edit salary revision' : 'New salary revision'}
    />
  );
};

const bonusFields = (components: SalaryComponent[]): FormField<CreateBonusInput>[] => [
  {
    name: 'componentId',
    label: 'Bonus component',
    type: 'select',
    placeholder: 'Select component',
    options: components.map((component) => ({ label: component.name, value: component.id })),
  },
  { name: 'expectedDate', label: 'Expected date', type: 'date' },
  {
    name: 'estimatedAmount',
    label: 'Estimated gross amount',
    type: 'number',
    placeholder: '0',
  },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

// Built per render rather than once at import: `new Date()` in a module
// constant is the same instant for the life of the tab, and differs between
// the server render and the client's.
const bonusDefaults = (): CreateBonusInput => ({
  componentId: '',
  expectedDate: new Date(),
  estimatedAmount: '',
  notes: '',
});

const BonusDialog = ({
  components,
  onSaved,
}: {
  components: SalaryComponent[];
  onSaved: () => void;
}) => {
  const bonusComponents = components.filter(
    (component) => component.frequency === 'one_time' && component.kind === 'earning',
  );
  const createBonus = api.salary.createBonus.useMutation();
  const mutation = {
    isPending: createBonus.isPending,
    mutateAsync: async (values: CreateBonusInput) =>
      createBonus.mutateAsync({ ...values, expectedDate: asCalendarDay(values.expectedDate) }),
  };
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          <Plus /> Bonus
        </Button>
      }
      customDescription={
        bonusComponents.length === 0 ? (
          <p className="text-destructive text-sm">Create a one-time earning component first.</p>
        ) : null
      }
      defaultValues={bonusDefaults()}
      fields={bonusFields(bonusComponents)}
      modalDescription="The estimate is included in the expected month and can be reconciled in an actual salary breakdown."
      mutation={mutation}
      refresh={onSaved}
      schema={createSalaryBonusSchema}
      submitButtonDisabled={bonusComponents.length === 0}
      submitButtonText="Add bonus estimate"
      successToast={() => 'Bonus estimate created'}
      titleText="Add estimated bonus"
    />
  );
};

const taxSettingsFields: FormField<TaxSettingsInput>[] = [
  { name: 'standardDeduction', label: 'Standard deduction', type: 'number', placeholder: '0' },
  {
    name: 'otherTaxableIncome',
    label: 'Additional estimated taxable income',
    type: 'number',
    placeholder: '0',
    description:
      'Use this for expected income not yet recorded as a taxable statement. Marked statements are added automatically.',
  },
  { name: 'otherDeductions', label: 'Other eligible deductions', type: 'number', placeholder: '0' },
];

const taxSettingsDefaults = (data: SalaryData): TaxSettingsInput => ({
  financialYearStart: data.financialYearStart,
  standardDeduction: data.taxSettings.standardDeduction,
  otherTaxableIncome: data.taxSettings.otherTaxableIncome,
  otherDeductions: data.taxSettings.otherDeductions,
});

const TaxSettingsDialog = ({ data, onSaved }: { data: SalaryData; onSaved: () => void }) => {
  const mutation = api.salary.updateTaxSettings.useMutation();
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          <Settings2 /> Tax assumptions
        </Button>
      }
      defaultValues={taxSettingsDefaults(data)}
      fields={taxSettingsFields}
      modalDescription="Projection uses India’s new-regime slabs for FY 2026–27. Adjust these annual inputs for your situation."
      mutation={mutation}
      refresh={onSaved}
      schema={updateSalaryTaxSettingsSchema}
      submitButtonText="Save assumptions"
      successToast={() => 'Tax assumptions updated'}
      titleText="Tax assumptions"
    />
  );
};

const formatSlabRange = (lower: number, upper: number | null) => {
  if (lower === 0 && upper !== null) {
    return `Up to ${formatCurrency(upper)}`;
  }
  if (upper === null) {
    return `Above ${formatCurrency(lower)}`;
  }
  return `Above ${formatCurrency(lower)} up to ${formatCurrency(upper)}`;
};

const TaxProjectionDialog = ({ data }: { data: SalaryData }) => {
  const [open, setOpen] = useState(false);
  const { tax } = data.summary;
  const projectedTotalTds = data.summary.actualTds + data.summary.projectedTds;
  const projectedTdsPosition = projectedTotalTds - data.summary.salaryTax.totalTax;

  return (
    <Modal
      className="sm:max-w-4xl"
      description={`Detailed new-regime estimate for FY ${data.financialYearStart}–${String(data.financialYearStart + 1).slice(-2)}.`}
      open={open}
      setOpen={setOpen}
      title="Tax projection breakdown"
      trigger={
        <Button size="sm" variant="outline">
          <ReceiptIndianRupee /> View breakdown
        </Button>
      }
    >
      <div className="max-h-[75vh] space-y-6 overflow-y-auto pr-1">
        <section className="space-y-3">
          <div>
            <h3 className="font-semibold">Taxable income</h3>
            <p className="text-muted-foreground text-xs">
              Salary forecasts, marked taxable statement amounts, and additional income estimates in
              this financial year.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border p-4 text-sm">
            <span className="text-muted-foreground">Salary taxable components</span>
            <span className="text-right tabular-nums">
              {formatCurrency(tax.salaryTaxableIncome)}
            </span>
            <span className="text-muted-foreground">Taxable statement portions</span>
            <span className="text-right tabular-nums">
              {formatCurrency(data.summary.statementTaxableIncome)}
            </span>
            <span className="text-muted-foreground">Additional income estimate</span>
            <span className="text-right tabular-nums">
              {formatCurrency(data.summary.additionalEstimatedTaxableIncome)}
            </span>
            <span className="border-t pt-2 font-medium">Outside salary total</span>
            <span className="border-t pt-2 text-right font-medium tabular-nums">
              {formatCurrency(data.summary.outsideTaxableIncome)}
            </span>
            <span className="border-t pt-2 font-medium">Gross taxable inputs</span>
            <span className="border-t pt-2 text-right font-medium tabular-nums">
              {formatCurrency(tax.grossTaxableIncome)}
            </span>
            <span className="text-muted-foreground">Standard deduction</span>
            <span className="text-right tabular-nums">
              − {formatCurrency(tax.standardDeduction)}
            </span>
            <span className="text-muted-foreground">Other eligible deductions</span>
            <span className="text-right tabular-nums">− {formatCurrency(tax.otherDeductions)}</span>
            <span className="border-t pt-2 font-semibold">Taxable after deductions</span>
            <span className="border-t pt-2 text-right font-semibold tabular-nums">
              {formatCurrency(tax.taxableIncome)}
            </span>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="font-semibold">Tax by slab</h3>
            <p className="text-muted-foreground text-xs">
              Each rate applies only to the portion of taxable income falling within that slab.
            </p>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Income slab</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Income in slab</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tax.slabs.map((slab) => (
                  <TableRow key={slab.lower}>
                    <TableCell>{formatSlabRange(slab.lower, slab.upper)}</TableCell>
                    <TableCell className="text-right tabular-nums">{slab.rate * 100}%</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(slab.taxableAmount)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(slab.tax)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Slab tax</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(tax.slabTax)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Final tax liability</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border p-4 text-sm">
            <span className="text-muted-foreground">Slab tax</span>
            <span className="text-right tabular-nums">{formatCurrency(tax.slabTax)}</span>
            <span className="text-muted-foreground">Rebate / marginal relief</span>
            <span className="text-right tabular-nums">− {formatCurrency(tax.rebate)}</span>
            <span className="text-muted-foreground">Tax after relief</span>
            <span className="text-right tabular-nums">
              {formatCurrency(Math.max(0, tax.slabTax - tax.rebate))}
            </span>
            <span className="text-muted-foreground">Surcharge</span>
            <span className="text-right tabular-nums">{formatCurrency(tax.surcharge)}</span>
            <span className="text-muted-foreground">Health &amp; education cess (4%)</span>
            <span className="text-right tabular-nums">{formatCurrency(tax.cess)}</span>
            <span className="border-t pt-2 font-medium">Tax on salary and bonuses</span>
            <span className="border-t pt-2 text-right font-medium tabular-nums">
              {formatCurrency(data.summary.projectedSalaryTax)}
            </span>
            <span className="text-amber-700 dark:text-amber-300">
              Extra tax from outside income
            </span>
            <span className="text-right font-semibold text-amber-700 tabular-nums dark:text-amber-300">
              {formatCurrency(data.summary.estimatedOutsideIncomeTax)}
            </span>
            <span className="border-t pt-2 font-semibold">Projected total tax</span>
            <span className="border-t pt-2 text-right font-semibold tabular-nums">
              {formatCurrency(tax.totalTax)}
            </span>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="font-semibold">TDS position</h3>
            <p className="text-muted-foreground text-xs">
              Employer TDS is reconciled against salary and bonuses only. Outside income remains a
              separate year-end estimate.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border p-4 text-sm">
            <span className="text-muted-foreground">TDS deducted so far</span>
            <span className="text-right tabular-nums">
              {formatCurrency(data.summary.actualTds)}
            </span>
            <span className="text-muted-foreground">Projected future TDS</span>
            <span className="text-right tabular-nums">
              {formatCurrency(data.summary.projectedTds)}
            </span>
            <span className="text-muted-foreground">Projected full-year TDS</span>
            <span className="text-right tabular-nums">{formatCurrency(projectedTotalTds)}</span>
            <span className="text-muted-foreground">Projected salary tax</span>
            <span className="text-right tabular-nums">
              {formatCurrency(data.summary.projectedSalaryTax)}
            </span>
            <span className="border-t pt-2 font-semibold">
              {getProjectedTdsPositionLabel(projectedTdsPosition)}
            </span>
            <span className="border-t pt-2 text-right font-semibold tabular-nums">
              {formatCurrency(Math.abs(projectedTdsPosition))}
            </span>
            <span className="border-t pt-2 font-semibold text-amber-700 dark:text-amber-300">
              Estimated year-end tax payable
            </span>
            <span className="border-t pt-2 text-right font-semibold text-amber-700 tabular-nums dark:text-amber-300">
              {formatCurrency(data.summary.projectedYearEndTaxPayable)}
            </span>
          </div>
        </section>

        <p className="text-muted-foreground text-xs">
          This is a planning estimate. Special-rate income, exemptions, employer rounding, and
          filing-specific adjustments can change the final tax liability.
        </p>
      </div>
    </Modal>
  );
};

const OutsideTaxableIncomeCard = ({ data }: { data: SalaryData }) => (
  <Card className="border-amber-500/30">
    <CardHeader>
      <CardTitle>Taxable income outside salary</CardTitle>
      <CardDescription>
        Statement portions and estimates that are not part of payroll. Their incremental tax is kept
        separate from employer TDS.
      </CardDescription>
      <CardAction>
        <BadgeIndianRupee className="size-5 text-amber-700 dark:text-amber-300" />
      </CardAction>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-xs">Marked statement portions</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatCurrency(data.summary.statementTaxableIncome)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-xs">Additional future estimate</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatCurrency(data.summary.additionalEstimatedTaxableIncome)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-xs">Total outside taxable income</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatCurrency(data.summary.outsideTaxableIncome)}
          </p>
        </div>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-xs text-amber-700 dark:text-amber-300">Estimated extra tax to pay</p>
          <p className="mt-1 text-lg font-semibold text-amber-700 tabular-nums dark:text-amber-300">
            {formatCurrency(data.summary.estimatedOutsideIncomeTax)}
          </p>
        </div>
      </div>

      {data.taxableStatements.length === 0 ? (
        <div className="bg-muted/30 rounded-lg border border-dashed p-6 text-center">
          <p className="font-medium">No taxable outside statements marked for this year.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Open a credited outside transaction in Statements and use Link Statement to mark its
            full or partial taxable amount.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Statement</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Bank credit</TableHead>
                <TableHead className="text-right">Taxable portion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.taxableStatements.map((statement) => (
                <TableRow key={statement.id}>
                  <TableCell>{formatDate(statement.createdAt)}</TableCell>
                  <TableCell className="font-medium">{statement.category}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {statement.accountName ?? 'Unknown account'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(statement.creditedAmount)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCurrency(statement.taxableAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Marked statements total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(data.summary.statementTaxableIncome)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        The extra-tax figure is the incremental annual tax after adding outside income on top of
        salary and bonuses. Any tax already withheld by a bank is not deducted unless recorded
        separately.
      </p>
    </CardContent>
  </Card>
);

/** The earnings and deductions that make up one month's payslip. */
const PaymentLines = ({
  value,
  onChange,
  components,
  bonuses,
}: {
  value: SalaryPaymentLineInput[];
  onChange: (lines: SalaryPaymentLineInput[]) => void;
  components: SalaryComponent[];
  bonuses: SalaryData['bonuses'];
}) => {
  const unresolvedBonuses = bonuses.filter(
    (bonus) => bonus.actualAmount === null && !value.some((line) => line.bonusId === bonus.id),
  );

  const addComponent = (componentId: string) => {
    const component = components.find((candidate) => candidate.id === componentId);
    if (component === undefined) {
      return;
    }
    onChange([
      ...value,
      {
        componentId: component.id,
        bonusId: null,
        name: component.name,
        kind: component.kind,
        classification: component.classification,
        affectsTaxableIncome: component.affectsTaxableIncome,
        amount: '0',
      },
    ]);
  };

  const addBonus = (bonusId: string) => {
    const bonus = bonuses.find((candidate) => candidate.id === bonusId);
    const component = components.find((candidate) => candidate.id === bonus?.componentId);
    if (bonus === undefined || component === undefined) {
      return;
    }
    onChange([
      ...value,
      {
        componentId: component.id,
        bonusId: bonus.id,
        name: component.name,
        kind: 'earning',
        classification: component.classification,
        affectsTaxableIncome: component.affectsTaxableIncome,
        amount: bonus.estimatedAmount,
      },
    ]);
  };

  return (
    <div className="space-y-2">
      {value.map((line, index) => (
        <div
          key={`${line.componentId ?? 'line'}-${line.bonusId ?? index}`}
          className="grid grid-cols-[1fr_8rem_2rem] items-center gap-2 rounded-lg border p-3"
        >
          <div>
            <p className="text-sm font-medium">{line.name}</p>
            <p className="text-muted-foreground text-xs">
              {line.kind} · {classificationLabels[line.classification]}
              {line.bonusId === null ? '' : ' · linked bonus'}
            </p>
          </div>
          <Input
            inputMode="decimal"
            value={line.amount}
            onChange={(event) => {
              onChange(
                value.map((candidate, candidateIndex) =>
                  candidateIndex === index
                    ? { ...candidate, amount: event.target.value }
                    : candidate,
                ),
              );
            }}
          />
          <Button
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => {
              onChange(value.filter((_line, candidateIndex) => candidateIndex !== index));
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Select onValueChange={addComponent}>
          <SelectTrigger>
            <SelectValue placeholder="Add component" />
          </SelectTrigger>
          <SelectContent>
            {components.map((component) => (
              <SelectItem key={component.id} value={component.id}>
                {component.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select disabled={unresolvedBonuses.length === 0} onValueChange={addBonus}>
          <SelectTrigger>
            <SelectValue placeholder="Reconcile bonus" />
          </SelectTrigger>
          <SelectContent>
            {unresolvedBonuses.map((bonus) => (
              <SelectItem key={bonus.id} value={bonus.id}>
                {bonus.componentName} · {formatCurrency(bonus.estimatedAmount)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

const paymentFields = (
  row: SalaryRow,
  components: SalaryComponent[],
  bonuses: SalaryData['bonuses'],
): FormField<UpdatePaymentInput>[] => [
  { name: 'paymentDate', label: 'Payment date', type: 'date' },
  { name: 'daysPaid', label: 'Days paid', type: 'integer', min: 0, max: row.daysInPeriod },
  {
    name: 'daysInPeriod',
    label: 'Days in month',
    type: 'custom',
    render: () => <Input disabled value={row.daysInPeriod} />,
  },
  {
    name: 'lines',
    label: 'Breakdown',
    type: 'custom',
    render: (field) => (
      <PaymentLines
        bonuses={bonuses}
        components={components}
        value={field.value as SalaryPaymentLineInput[]}
        onChange={field.onChange}
      />
    ),
  },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

const paymentDefaults = (row: SalaryRow, paymentId: string): UpdatePaymentInput => ({
  paymentId,
  paymentDate: row.paymentDate,
  daysPaid: row.daysPaid,
  daysInPeriod: row.daysInPeriod,
  notes: row.notes ?? '',
  lines: row.components.map((line) => ({
    componentId: line.componentId,
    bonusId: 'bonusId' in line ? line.bonusId : null,
    name: line.name,
    kind: line.kind,
    classification: line.classification,
    affectsTaxableIncome: line.affectsTaxableIncome,
    amount: String(line.amount),
  })),
});

const PaymentDialog = ({
  row,
  components,
  bonuses,
  onSaved,
}: {
  row: SalaryRow;
  components: SalaryComponent[];
  bonuses: SalaryData['bonuses'];
  onSaved: () => void;
}) => {
  const updatePayment = api.salary.updatePayment.useMutation();
  const mutation = {
    isPending: updatePayment.isPending,
    // An empty notes box means no note, not an empty one.
    mutateAsync: async (values: UpdatePaymentInput) =>
      updatePayment.mutateAsync({
        ...values,
        paymentDate: asCalendarDay(values.paymentDate),
        notes: values.notes === '' ? null : values.notes,
      }),
  };
  const { paymentId } = row;
  if (paymentId === null) {
    return null;
  }
  return (
    <MutationModal
      button={
        <Button size="icon" title="Edit salary breakdown" variant="ghost">
          <SquarePen />
        </Button>
      }
      customDescription={
        row.statementAmount === null ? null : (
          <p className="text-muted-foreground text-xs">
            Linked bank transaction: {formatCurrency(row.statementAmount)}. Save the corrected
            breakdown so its net matches this amount.
          </p>
        )
      }
      defaultValues={paymentDefaults(row, paymentId)}
      fields={paymentFields(row, components, bonuses)}
      modalClassName="sm:max-w-3xl"
      modalDescription="Earnings and deductions are normally positive. A negative TDS reconciliation reduces withholding."
      mutation={mutation}
      refresh={onSaved}
      schema={updateSalaryPaymentSchema}
      submitButtonText="Save breakdown"
      successToast={() => 'Salary breakdown updated'}
      titleText={`Salary breakdown · ${formatDate(row.periodStart, { month: 'long', day: 'numeric' })}`}
    />
  );
};

export const SalaryDashboard = ({ data }: { data: SalaryData }) => {
  const router = useRouter();
  const refresh = () => {
    router.refresh();
  };
  const previousYear = data.financialYearStart - 1;
  const nextYear = data.financialYearStart + 1;
  const deleteComponent = api.salary.deleteComponent.useMutation();
  const deleteRevision = api.salary.deleteRevision.useMutation();
  const deleteBonus = api.salary.deleteBonus.useMutation();
  const periodLabel = `FY ${data.financialYearStart}–${String(nextYear).slice(-2)}`;
  const hasSetup = data.components.length > 0 && data.revisions.length > 0;
  const actualRows = useMemo(() => data.rows.filter((row) => row.status === 'actual'), [data.rows]);
  const estimatedBonusTotals = useMemo(
    () =>
      data.bonuses.reduce(
        (totals, bonus) => {
          if (bonus.estimatedTax === null || bonus.estimatedNet === null) {
            return totals;
          }

          return {
            gross: totals.gross + Number(bonus.actualAmount ?? bonus.estimatedAmount),
            tax: totals.tax + bonus.estimatedTax,
            net: totals.net + bonus.estimatedNet,
            count: totals.count + 1,
          };
        },
        { gross: 0, tax: 0, net: 0, count: 0 },
      ),
    [data.bonuses],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Salary & tax planner</h2>
          <p className="text-muted-foreground text-sm">
            Actual payroll, future income, bonuses, PF, TDS, and annual tax in one view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              router.push(`/salary?fy=${previousYear}`);
            }}
          >
            ← FY {previousYear}
          </Button>
          <Badge className="px-3" variant="secondary">
            {periodLabel}
          </Badge>
          <Button
            variant="outline"
            onClick={() => {
              router.push(`/salary?fy=${nextYear}`);
            }}
          >
            FY {nextYear} →
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          description={`${actualRows.length} linked salary payment${actualRows.length === 1 ? '' : 's'}`}
          icon={WalletCards}
          title="Received so far"
          value={formatCurrency(data.summary.actualReceived)}
        />
        <SummaryCard
          description="Future scheduled salary after estimated deductions"
          icon={CalendarClock}
          title="Projected remaining net"
          value={formatCurrency(data.summary.projectedRemainingNet)}
        />
        <SummaryCard
          description={`Actual taxable so far: ${formatCurrency(data.summary.actualTaxableIncome)}`}
          icon={Landmark}
          title="Projected salary taxable income"
          value={formatCurrency(data.summary.projectedAnnualTaxableIncome)}
        />
        <SummaryCard
          description={`Salary tax: ${formatCurrency(data.summary.projectedSalaryTax)} · outside tax: ${formatCurrency(data.summary.estimatedOutsideIncomeTax)}`}
          icon={ReceiptIndianRupee}
          title="Projected total tax"
          value={formatCurrency(data.summary.projectedTotalTax)}
        />
      </div>

      <OutsideTaxableIncomeCard data={data} />

      <Card>
        <CardHeader>
          <CardTitle>Financial-year payroll</CardTitle>
          <CardDescription>
            Actual linked salaries replace estimates; the remaining salary and bonus TDS balance is
            spread across future full months. Outside-income tax stays separate.
          </CardDescription>
          <CardAction>
            <TaxSettingsDialog data={data} onSaved={refresh} />
          </CardAction>
        </CardHeader>
        <CardContent>
          {!hasSetup ? (
            <div className="bg-muted/30 rounded-lg border border-dashed p-8 text-center">
              <p className="font-medium">
                Create components and a salary revision to start forecasting.
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                A revision captures your fixed monthly structure from an effective date.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period / revision</TableHead>
                  <TableHead>Pay date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">TDS</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => {
                  const mismatch = hasMaterialSalaryNetMismatch(
                    row.statementAmount,
                    row.totals.net,
                  );
                  const bonusTdsAdjustment = row.components.reduce(
                    (total, component) =>
                      'forecastAdjustment' in component &&
                      component.forecastAdjustment === 'bonus_tds'
                        ? total + component.amount
                        : total,
                    0,
                  );
                  const reconciliationTdsAdjustment = row.components.reduce((total, component) => {
                    if (
                      !('forecastAdjustment' in component) ||
                      component.forecastAdjustment !== 'year_end_reconciliation'
                    ) {
                      return total;
                    }
                    return total + component.amount;
                  }, 0);
                  const presentation = statusPresentation[row.status];
                  return (
                    <TableRow key={`${row.revisionId}-${row.periodStart.toISOString()}`}>
                      <TableCell>
                        <p className="font-medium">
                          {new Intl.DateTimeFormat('en-IN', {
                            month: 'long',
                            year: 'numeric',
                            timeZone: 'UTC',
                          }).format(row.periodStart)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {row.revisionName}
                          {row.daysPaid === row.daysInPeriod
                            ? ''
                            : ` · ${row.daysPaid}/${row.daysInPeriod} days`}
                        </p>
                      </TableCell>
                      <TableCell>{formatDate(row.paymentDate)}</TableCell>
                      <TableCell>
                        <Badge variant={presentation.variant}>{presentation.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.totals.earnings)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.totals.deductions)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="font-medium">{formatCurrency(row.totals.tds)}</span>
                        {bonusTdsAdjustment === 0 ? null : (
                          <p className="text-muted-foreground text-xs">
                            Bonus tax {formatSignedCurrency(bonusTdsAdjustment)}
                          </p>
                        )}
                        {reconciliationTdsAdjustment === 0 ? null : (
                          <p className="text-muted-foreground text-xs">
                            Tax balance {formatSignedCurrency(reconciliationTdsAdjustment)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={mismatch ? 'text-destructive font-semibold' : 'font-semibold'}
                        >
                          {formatCurrency(row.totals.net)}
                        </span>
                        {mismatch ? (
                          <p className="text-destructive text-xs">
                            Bank: {formatCurrency(row.statementAmount as number)}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.totals.taxableIncome)}
                      </TableCell>
                      <TableCell className="text-right">
                        <PaymentDialog
                          bonuses={data.bonuses}
                          components={data.components}
                          row={row}
                          onSaved={refresh}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>One-time bonuses</CardTitle>
            <CardDescription>
              Pending estimates are taxed after regular salary, so their impact naturally lands in
              the higher marginal slab.
            </CardDescription>
            <CardAction>
              <BonusDialog components={data.components} onSaved={refresh} />
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.bonuses.length === 0 ? (
              <p className="text-muted-foreground text-sm">No bonuses planned.</p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bonus</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Tax deduction</TableHead>
                      <TableHead className="text-right">Net pay</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.bonuses.map((bonus) => (
                      <TableRow key={bonus.id}>
                        <TableCell>
                          <p className="font-medium">{bonus.componentName}</p>
                          <p className="text-muted-foreground text-xs">
                            Expected {formatDate(bonus.expectedDate)} ·{' '}
                            {bonus.actualAmount === null ? 'estimate' : 'reconciled'}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(bonus.actualAmount ?? bonus.estimatedAmount)}
                          {bonus.actualAmount === null ? null : (
                            <p className="text-muted-foreground text-xs font-normal">
                              Est. {formatCurrency(bonus.estimatedAmount)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {bonus.estimatedTax === null ? (
                            <span className="text-muted-foreground text-xs">In actual payroll</span>
                          ) : (
                            formatCurrency(bonus.estimatedTax)
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {bonus.estimatedNet === null ? (
                            <span className="text-muted-foreground text-xs">See actual salary</span>
                          ) : (
                            formatCurrency(bonus.estimatedNet)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DeleteConfirmationDialog
                            mutation={deleteBonus}
                            mutationInput={{ id: bonus.id }}
                            refresh={refresh}
                          >
                            <Button
                              aria-label={`Delete ${bonus.componentName}`}
                              size="icon"
                              variant="ghost"
                            >
                              <Trash2 />
                            </Button>
                          </DeleteConfirmationDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {estimatedBonusTotals.count === 0 ? null : (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Pending estimates total</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(estimatedBonusTotals.gross)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(estimatedBonusTotals.tax)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(estimatedBonusTotals.net)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax projection detail</CardTitle>
            <CardDescription>
              New regime estimate including standard deduction, rebate/marginal relief, surcharge,
              and 4% cess.
            </CardDescription>
            <CardAction>
              <TaxProjectionDialog data={data} />
            </CardAction>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <span className="text-muted-foreground">Gross taxable inputs</span>
            <span className="text-right font-medium">
              {formatCurrency(data.summary.tax.grossTaxableIncome)}
            </span>
            <span className="text-muted-foreground">Taxable after deductions</span>
            <span className="text-right font-medium">
              {formatCurrency(data.summary.tax.taxableIncome)}
            </span>
            <span className="text-muted-foreground">Slab tax</span>
            <span className="text-right font-medium">
              {formatCurrency(data.summary.tax.slabTax)}
            </span>
            <span className="text-muted-foreground">Rebate / marginal relief</span>
            <span className="text-right font-medium">
              − {formatCurrency(data.summary.tax.rebate)}
            </span>
            <span className="text-muted-foreground">Surcharge</span>
            <span className="text-right font-medium">
              {formatCurrency(data.summary.tax.surcharge)}
            </span>
            <span className="text-muted-foreground">Health & education cess</span>
            <span className="text-right font-medium">{formatCurrency(data.summary.tax.cess)}</span>
            <span className="border-t pt-3 font-semibold">Projected tax</span>
            <span className="border-t pt-3 text-right font-semibold">
              {formatCurrency(data.summary.tax.totalTax)}
            </span>
            <span className="font-semibold text-amber-700 dark:text-amber-300">
              Outside-income tax
            </span>
            <span className="text-right font-semibold text-amber-700 dark:text-amber-300">
              {formatCurrency(data.summary.estimatedOutsideIncomeTax)}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Salary setup</CardTitle>
          <CardDescription>
            Components are reusable definitions. Revisions are dated snapshots, so historical
            payroll never changes when your salary changes.
          </CardDescription>
          <CardAction>
            <div className="flex gap-2">
              <ComponentDialog onSaved={refresh} />
              <RevisionDialog components={data.components} onSaved={refresh} />
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Components</h3>
            {data.components.length === 0 ? (
              <p className="text-muted-foreground text-sm">No components yet.</p>
            ) : (
              data.components.map((component) => (
                <div
                  key={component.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{component.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {component.kind} · {component.frequency.replace('_', ' ')} ·{' '}
                      {classificationLabels[component.classification]}
                      {component.affectsTaxableIncome ? ' · taxable' : ''}
                    </p>
                  </div>
                  <DeleteConfirmationDialog
                    mutation={deleteComponent}
                    mutationInput={{ id: component.id }}
                    refresh={refresh}
                  >
                    <Button size="icon" variant="ghost">
                      <Trash2 />
                    </Button>
                  </DeleteConfirmationDialog>
                </div>
              ))
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Effective-dated revisions</h3>
            {data.revisions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No salary revisions yet.</p>
            ) : (
              data.revisions.map((revision) => (
                <div
                  key={revision.id}
                  className="flex items-start justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{revision.name}</p>
                    <p className="text-muted-foreground text-xs">
                      From {formatDate(revision.effectiveFrom)} · pay day {revision.payDay}
                    </p>
                    <p className="mt-1 text-xs">
                      {revision.components
                        .map(
                          (entry) =>
                            `${entry.component?.name ?? 'Unknown'} ${formatCurrency(entry.amount)}`,
                        )
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {revision.hasLinkedPayments ? (
                      <Button
                        aria-label={`${revision.name} cannot be edited because it has linked salaries`}
                        disabled
                        size="icon"
                        title="Linked salaries lock this revision; create a new revision for future changes"
                        variant="ghost"
                      >
                        <SquarePen />
                      </Button>
                    ) : (
                      <RevisionDialog
                        components={data.components}
                        revision={revision}
                        onSaved={refresh}
                      />
                    )}
                    <DeleteConfirmationDialog
                      mutation={deleteRevision}
                      mutationInput={{ id: revision.id }}
                      refresh={refresh}
                    >
                      <Button
                        aria-label={`Delete ${revision.name}`}
                        disabled={revision.hasLinkedPayments}
                        size="icon"
                        title={
                          revision.hasLinkedPayments
                            ? 'Linked salaries lock this revision'
                            : 'Delete revision'
                        }
                        variant="ghost"
                      >
                        <Trash2 />
                      </Button>
                    </DeleteConfirmationDialog>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Tax figures are planning estimates. Company holiday calendars, exemptions, special-rate
        income, employer payroll rounding, and filing-specific rules can change the final liability.
      </p>
    </div>
  );
};
