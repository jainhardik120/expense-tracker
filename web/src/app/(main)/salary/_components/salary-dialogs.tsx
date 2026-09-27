'use client';

import { useState } from 'react';

import { Plus, ReceiptIndianRupee, Settings2, SquarePen, Trash2 } from 'lucide-react';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import Modal from '@/components/modal';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { formatFinancialYearLabel } from '@/lib/salary';
import { api } from '@/server/react';
import {
  createSalaryBonusSchema,
  createSalaryComponentSchema,
  createSalaryRevisionSchema,
  type SalaryPaymentLineInput,
  updateSalaryPaymentSchema,
  updateSalaryTaxSettingsSchema,
  PERCENTAGE_DIVISOR,
} from '@/types';

import {
  asCalendarDay,
  classificationLabels,
  DEFAULT_PAY_DAY,
  formatSlabRange,
  getProjectedTdsPositionLabel,
  type SalaryComponent,
  type SalaryData,
  type SalaryRevision,
  type SalaryRow,
} from './shared';

import type { z } from 'zod';

type CreateComponentInput = z.input<typeof createSalaryComponentSchema>;
type CreateRevisionInput = z.input<typeof createSalaryRevisionSchema>;
type RevisionComponentInput = CreateRevisionInput['components'][number];
type CreateBonusInput = z.input<typeof createSalaryBonusSchema>;
type TaxSettingsInput = z.input<typeof updateSalaryTaxSettingsSchema>;
type UpdatePaymentInput = z.input<typeof updateSalaryPaymentSchema>;

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

export const ComponentDialog = ({ onSaved }: { onSaved: () => void }) => {
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

export const RevisionDialog = ({
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

export const BonusDialog = ({
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

export const TaxSettingsDialog = ({ data, onSaved }: { data: SalaryData; onSaved: () => void }) => {
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

export const TaxProjectionDialog = ({ data }: { data: SalaryData }) => {
  const [open, setOpen] = useState(false);
  const { tax } = data.summary;
  const projectedTotalTds = data.summary.actualTds + data.summary.projectedTds;
  const projectedTdsPosition = projectedTotalTds - data.summary.salaryTax.totalTax;

  return (
    <Modal
      className="sm:max-w-4xl"
      description={`Detailed new-regime estimate for FY ${formatFinancialYearLabel(data.financialYearStart)}.`}
      open={open}
      setOpen={setOpen}
      title="Tax projection breakdown"
      trigger={
        <Button size="icon" title="View tax breakdown" variant="ghost">
          <ReceiptIndianRupee />
        </Button>
      }
    >
      <div className="space-y-6">
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
                    <TableCell className="text-right tabular-nums">
                      {slab.rate * PERCENTAGE_DIVISOR}%
                    </TableCell>
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

export const PaymentDialog = ({
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

/**
 * Components and revisions: the definitions behind the payroll, rather than
 * the payroll itself. They live behind a dialog because they are edited rarely
 * and read never.
 */
export const SalarySetupDialog = ({ data, onSaved }: { data: SalaryData; onSaved: () => void }) => {
  const [open, setOpen] = useState(false);
  const deleteComponent = api.salary.deleteComponent.useMutation();
  const deleteRevision = api.salary.deleteRevision.useMutation();

  return (
    <Modal
      className="sm:max-w-3xl"
      open={open}
      setOpen={setOpen}
      title="Salary setup"
      trigger={
        <Button size="sm" variant="outline">
          <Settings2 /> Salary setup
        </Button>
      }
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Components</h3>
            <ComponentDialog onSaved={onSaved} />
          </div>
          {data.components.length === 0 ? (
            <p className="text-muted-foreground text-sm">No components yet.</p>
          ) : (
            data.components.map((component) => (
              <div
                key={component.id}
                className="flex items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{component.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {component.kind} · {component.frequency.replace('_', ' ')} ·{' '}
                    {classificationLabels[component.classification]}
                    {component.affectsTaxableIncome ? ' · taxable' : ''}
                  </p>
                </div>
                <DeleteConfirmationDialog
                  mutation={deleteComponent}
                  mutationInput={{ id: component.id }}
                  refresh={onSaved}
                >
                  <Button aria-label={`Delete ${component.name}`} size="icon" variant="ghost">
                    <Trash2 />
                  </Button>
                </DeleteConfirmationDialog>
              </div>
            ))
          )}
        </section>
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Effective-dated revisions</h3>
            <RevisionDialog components={data.components} onSaved={onSaved} />
          </div>
          {data.revisions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No salary revisions yet.</p>
          ) : (
            data.revisions.map((revision) => (
              <div
                key={revision.id}
                className="flex items-start justify-between gap-2 rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{revision.name}</p>
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
                      onSaved={onSaved}
                    />
                  )}
                  <DeleteConfirmationDialog
                    mutation={deleteRevision}
                    mutationInput={{ id: revision.id }}
                    refresh={onSaved}
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
        </section>
      </div>
    </Modal>
  );
};
