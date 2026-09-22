'use client';

import { useMemo, useState, type FormEvent } from 'react';

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
import { toast } from 'sonner';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import Modal from '@/components/modal';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatDate } from '@/lib/format';
import { hasMaterialSalaryNetMismatch } from '@/lib/salary';
import { api } from '@/server/react';
import type { RouterOutput } from '@/server/routers';

type SalaryData = RouterOutput['salary']['getPageData'];
type SalaryRow = SalaryData['rows'][number];
type SalaryComponent = SalaryData['components'][number];
type SalaryRevision = SalaryData['revisions'][number];
type PaymentLine = {
  rowKey: string;
  componentId: string | null;
  bonusId: string | null;
  name: string;
  kind: 'earning' | 'deduction';
  classification: 'regular' | 'tax_withholding' | 'provident_fund' | 'other';
  affectsTaxableIncome: boolean;
  amount: string;
};

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

const changeLineAmount = (lines: PaymentLine[], rowKey: string, amount: string) =>
  lines.map((line) => (line.rowKey === rowKey ? { ...line, amount } : line));

const removePaymentLine = (lines: PaymentLine[], rowKey: string) =>
  lines.filter((line) => line.rowKey !== rowKey);

const formatSignedCurrency = (value: number) =>
  `${value >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(value))}`;

const getProjectedTdsPositionLabel = (position: number) => {
  if (position === 0) {
    return 'Projected TDS matches tax';
  }
  return position > 0 ? 'Estimated TDS surplus' : 'Estimated tax shortfall';
};

const toDateInput = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;

const fromDateInput = (value: string) => new Date(`${value}T12:00:00.000Z`);

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

const ComponentDialog = ({ onSaved }: { onSaved: () => void }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'earning' | 'deduction'>('earning');
  const [frequency, setFrequency] = useState<'monthly' | 'one_time'>('monthly');
  const [classification, setClassification] =
    useState<SalaryComponent['classification']>('regular');
  const [taxable, setTaxable] = useState(true);
  const [proratable, setProratable] = useState(true);
  const mutation = api.salary.createComponent.useMutation();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await mutation.mutateAsync({
        name,
        kind,
        frequency,
        classification,
        affectsTaxableIncome: taxable,
        proratable,
      });
      toast.success('Salary component created');
      setOpen(false);
      setName('');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal
      description="Components can be reused across salary revisions and actual breakdowns."
      open={open}
      setOpen={setOpen}
      title="New salary component"
      trigger={
        <Button size="sm" variant="outline">
          <Plus /> Component
        </Button>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <FormField label="Name">
          <Input
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Direction">
            <Select
              value={kind}
              onValueChange={(value) => {
                setKind(value as typeof kind);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="earning">Earning</SelectItem>
                <SelectItem value="deduction">Deduction</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Frequency">
            <Select
              value={frequency}
              onValueChange={(value) => {
                setFrequency(value as typeof frequency);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="one_time">One time / bonus</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <FormField label="Classification">
          <Select
            value={classification}
            onValueChange={(value) => {
              setClassification(value as typeof classification);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(classificationLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={taxable}
              onCheckedChange={(value) => {
                setTaxable(value === true);
              }}
            />
            Affects taxable salary
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={proratable}
              onCheckedChange={(value) => {
                setProratable(value === true);
              }}
            />
            Prorate for partial month
          </label>
        </div>
        <Button className="w-full" disabled={mutation.isPending} type="submit">
          Create component
        </Button>
      </form>
    </Modal>
  );
};

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
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(revision?.name ?? 'Current salary');
  const [effectiveFrom, setEffectiveFrom] = useState(
    toDateInput(revision?.effectiveFrom ?? new Date()),
  );
  const [payDay, setPayDay] = useState(String(revision?.payDay ?? 25));
  const [payDateRule, setPayDateRule] = useState<'exact' | 'previous_weekday'>(
    revision?.payDateRule ?? 'previous_weekday',
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      revision?.components.map((component) => [component.componentId, component.amount]) ?? [],
    ),
  );
  const createMutation = api.salary.createRevision.useMutation();
  const updateMutation = api.salary.updateRevision.useMutation();
  const isEditing = revision !== undefined;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(revision?.name ?? 'Current salary');
      setEffectiveFrom(toDateInput(revision?.effectiveFrom ?? new Date()));
      setPayDay(String(revision?.payDay ?? 25));
      setPayDateRule(revision?.payDateRule ?? 'previous_weekday');
      setAmounts(
        Object.fromEntries(
          revision?.components.map((component) => [component.componentId, component.amount]) ?? [],
        ),
      );
    }
    setOpen(nextOpen);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selected = monthly.flatMap((component) => {
      const amount = (amounts[component.id] ?? '').trim();
      return amount === '' ? [] : [{ componentId: component.id, amount }];
    });
    if (selected.length === 0) {
      toast.error('Enter an amount for at least one monthly component');
      return;
    }
    try {
      const values = {
        name,
        effectiveFrom: fromDateInput(effectiveFrom),
        payDay: Number(payDay),
        payDateRule,
        components: selected,
      };
      if (revision === undefined) {
        await createMutation.mutateAsync(values);
      } else {
        await updateMutation.mutateAsync({ id: revision.id, ...values });
      }
      toast.success(isEditing ? 'Salary revision updated' : 'Salary revision created');
      setOpen(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal
      className="sm:max-w-2xl"
      description={
        isEditing
          ? 'Update this future salary structure. Linked payroll records remain immutable.'
          : 'Use a new effective date for increments, job switches, or any fixed-pay change.'
      }
      open={open}
      setOpen={handleOpenChange}
      title={isEditing ? 'Edit salary revision' : 'New salary revision'}
      trigger={
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
    >
      <form className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Revision name">
            <Input
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Effective from">
            <Input
              required
              type="date"
              value={effectiveFrom}
              onChange={(event) => {
                setEffectiveFrom(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Usual pay day">
            <Input
              max={31}
              min={1}
              required
              type="number"
              value={payDay}
              onChange={(event) => {
                setPayDay(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Weekend handling">
            <Select
              value={payDateRule}
              onValueChange={(value) => {
                setPayDateRule(value as typeof payDateRule);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="previous_weekday">Previous weekday</SelectItem>
                <SelectItem value="exact">Exact date</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <p className="font-medium">Monthly components</p>
            <p className="text-muted-foreground text-xs">Leave an amount blank to exclude it.</p>
          </div>
          {monthly.length === 0 ? (
            <p className="text-muted-foreground text-sm">Create monthly components first.</p>
          ) : (
            monthly.map((component) => (
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
                  value={amounts[component.id] ?? ''}
                  onChange={(event) => {
                    setAmounts((current) => ({ ...current, [component.id]: event.target.value }));
                  }}
                />
              </div>
            ))
          )}
        </div>
        <Button className="w-full" disabled={isPending || monthly.length === 0} type="submit">
          {isEditing ? 'Save revision' : 'Create revision'}
        </Button>
      </form>
    </Modal>
  );
};

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
  const [open, setOpen] = useState(false);
  const [componentId, setComponentId] = useState('');
  const [expectedDate, setExpectedDate] = useState(toDateInput(new Date()));
  const [estimatedAmount, setEstimatedAmount] = useState('');
  const [notes, setNotes] = useState('');
  const mutation = api.salary.createBonus.useMutation();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await mutation.mutateAsync({
        componentId,
        expectedDate: fromDateInput(expectedDate),
        estimatedAmount,
        notes,
      });
      toast.success('Bonus estimate created');
      setOpen(false);
      setEstimatedAmount('');
      setNotes('');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal
      description="The estimate is included in the expected month and can be reconciled in an actual salary breakdown."
      open={open}
      setOpen={setOpen}
      title="Add estimated bonus"
      trigger={
        <Button size="sm" variant="outline">
          <Plus /> Bonus
        </Button>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <FormField label="Bonus component">
          <Select required value={componentId} onValueChange={setComponentId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select component" />
            </SelectTrigger>
            <SelectContent>
              {bonusComponents.map((component) => (
                <SelectItem key={component.id} value={component.id}>
                  {component.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Expected date">
            <Input
              required
              type="date"
              value={expectedDate}
              onChange={(event) => {
                setExpectedDate(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Estimated gross amount">
            <Input
              inputMode="decimal"
              required
              value={estimatedAmount}
              onChange={(event) => {
                setEstimatedAmount(event.target.value);
              }}
            />
          </FormField>
        </div>
        <FormField label="Notes">
          <Textarea
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
          />
        </FormField>
        {bonusComponents.length === 0 ? (
          <p className="text-destructive text-sm">Create a one-time earning component first.</p>
        ) : null}
        <Button
          className="w-full"
          disabled={mutation.isPending || bonusComponents.length === 0}
          type="submit"
        >
          Add bonus estimate
        </Button>
      </form>
    </Modal>
  );
};

const TaxSettingsDialog = ({ data, onSaved }: { data: SalaryData; onSaved: () => void }) => {
  const [open, setOpen] = useState(false);
  const [standardDeduction, setStandardDeduction] = useState(data.taxSettings.standardDeduction);
  const [otherTaxableIncome, setOtherTaxableIncome] = useState(data.taxSettings.otherTaxableIncome);
  const [otherDeductions, setOtherDeductions] = useState(data.taxSettings.otherDeductions);
  const mutation = api.salary.updateTaxSettings.useMutation();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await mutation.mutateAsync({
        financialYearStart: data.financialYearStart,
        standardDeduction,
        otherTaxableIncome,
        otherDeductions,
      });
      toast.success('Tax assumptions updated');
      setOpen(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal
      description="Projection uses India’s new-regime slabs for FY 2026–27. Adjust these annual inputs for your situation."
      open={open}
      setOpen={setOpen}
      title="Tax assumptions"
      trigger={
        <Button size="sm" variant="outline">
          <Settings2 /> Tax assumptions
        </Button>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <FormField label="Standard deduction">
          <Input
            inputMode="decimal"
            required
            value={standardDeduction}
            onChange={(event) => {
              setStandardDeduction(event.target.value);
            }}
          />
        </FormField>
        <FormField
          hint="Use this for expected income not yet recorded as a taxable statement. Marked statements are added automatically."
          label="Additional estimated taxable income"
        >
          <Input
            inputMode="decimal"
            required
            value={otherTaxableIncome}
            onChange={(event) => {
              setOtherTaxableIncome(event.target.value);
            }}
          />
        </FormField>
        <FormField label="Other eligible deductions">
          <Input
            inputMode="decimal"
            required
            value={otherDeductions}
            onChange={(event) => {
              setOtherDeductions(event.target.value);
            }}
          />
        </FormField>
        <Button className="w-full" disabled={mutation.isPending} type="submit">
          Save assumptions
        </Button>
      </form>
    </Modal>
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
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Income slab</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-right">Income in slab</th>
                  <th className="px-4 py-3 text-right">Tax</th>
                </tr>
              </thead>
              <tbody>
                {tax.slabs.map((slab) => (
                  <tr key={slab.lower} className="border-t">
                    <td className="px-4 py-3">{formatSlabRange(slab.lower, slab.upper)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{slab.rate * 100}%</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(slab.taxableAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatCurrency(slab.tax)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t font-semibold">
                  <td className="px-4 py-3" colSpan={3}>
                    Slab tax
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(tax.slabTax)}
                  </td>
                </tr>
              </tfoot>
            </table>
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
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-left text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Statement</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Bank credit</th>
                <th className="px-4 py-3 text-right">Taxable portion</th>
              </tr>
            </thead>
            <tbody>
              {data.taxableStatements.map((statement) => (
                <tr key={statement.id} className="border-t">
                  <td className="px-4 py-3">{formatDate(statement.createdAt)}</td>
                  <td className="px-4 py-3 font-medium">{statement.category}</td>
                  <td className="text-muted-foreground px-4 py-3">
                    {statement.accountName ?? 'Unknown account'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(statement.creditedAmount)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatCurrency(statement.taxableAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 border-t font-semibold">
                <td className="px-4 py-3" colSpan={4}>
                  Marked statements total
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(data.summary.statementTaxableIncome)}
                </td>
              </tr>
            </tfoot>
          </table>
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
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(toDateInput(row.paymentDate));
  const [daysPaid, setDaysPaid] = useState(String(row.daysPaid));
  const [notes, setNotes] = useState(row.notes ?? '');
  const initialLines = () =>
    row.components.map((line) => ({
      rowKey: 'id' in line ? line.id : crypto.randomUUID(),
      componentId: line.componentId,
      bonusId: 'bonusId' in line ? line.bonusId : null,
      name: line.name,
      kind: line.kind,
      classification: line.classification,
      affectsTaxableIncome: line.affectsTaxableIncome,
      amount: String(line.amount),
    }));
  const [lines, setLines] = useState<PaymentLine[]>(initialLines);
  const mutation = api.salary.updatePayment.useMutation();

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setPaymentDate(toDateInput(row.paymentDate));
      setDaysPaid(String(row.daysPaid));
      setNotes(row.notes ?? '');
      setLines(initialLines());
    }
    setOpen(nextOpen);
  };

  const { paymentId } = row;
  if (paymentId === null) {
    return null;
  }
  const unresolvedBonuses = bonuses.filter(
    (bonus) => bonus.actualAmount === null && !lines.some((line) => line.bonusId === bonus.id),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await mutation.mutateAsync({
        paymentId,
        paymentDate: fromDateInput(paymentDate),
        daysPaid: Number(daysPaid),
        daysInPeriod: row.daysInPeriod,
        notes: notes === '' ? null : notes,
        lines: lines.map(({ rowKey: _rowKey, ...line }) => line),
      });
      toast.success('Salary breakdown updated');
      setOpen(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const addComponent = (componentId: string) => {
    const component = components.find((candidate) => candidate.id === componentId);
    if (component === undefined) {
      return;
    }
    setLines((current) => [
      ...current,
      {
        rowKey: crypto.randomUUID(),
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
    if (bonus === undefined) {
      return;
    }
    const component = components.find((candidate) => candidate.id === bonus.componentId);
    if (component === undefined) {
      return;
    }
    setLines((current) => [
      ...current,
      {
        rowKey: crypto.randomUUID(),
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
    <Modal
      className="sm:max-w-3xl"
      description="Earnings and deductions are normally positive. A negative TDS reconciliation reduces withholding."
      open={open}
      setOpen={handleOpenChange}
      title={`Salary breakdown · ${formatDate(row.periodStart, { month: 'long', day: 'numeric' })}`}
      trigger={
        <Button size="icon" title="Edit salary breakdown" variant="ghost">
          <SquarePen />
        </Button>
      }
    >
      <form className="max-h-[75vh] space-y-4 overflow-y-auto pr-1" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Payment date">
            <Input
              required
              type="date"
              value={paymentDate}
              onChange={(event) => {
                setPaymentDate(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Days paid">
            <Input
              max={row.daysInPeriod}
              min={0}
              required
              type="number"
              value={daysPaid}
              onChange={(event) => {
                setDaysPaid(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Days in month">
            <Input disabled value={row.daysInPeriod} />
          </FormField>
        </div>
        <div className="space-y-2">
          {lines.map((line) => (
            <div
              key={line.rowKey}
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
                required
                value={line.amount}
                onChange={(event) => {
                  setLines((current) => changeLineAmount(current, line.rowKey, event.target.value));
                }}
              />
              <Button
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => {
                  setLines((current) => removePaymentLine(current, line.rowKey));
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
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
        <FormField label="Notes">
          <Textarea
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
          />
        </FormField>
        {row.statementAmount === null ? null : (
          <p className="text-muted-foreground text-xs">
            Linked bank transaction: {formatCurrency(row.statementAmount)}. Save the corrected
            breakdown so its net matches this amount.
          </p>
        )}
        <Button
          className="w-full"
          disabled={mutation.isPending || lines.length === 0}
          type="submit"
        >
          Save breakdown
        </Button>
      </form>
    </Modal>
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
        <CardContent className="overflow-x-auto">
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
            <table className="w-full min-w-[1020px] text-sm">
              <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                <tr>
                  <th className="py-3">Period / revision</th>
                  <th>Pay date</th>
                  <th>Status</th>
                  <th className="text-right">Earnings</th>
                  <th className="text-right">Deductions</th>
                  <th className="text-right">TDS</th>
                  <th className="text-right">Net</th>
                  <th className="text-right">Taxable</th>
                  <th />
                </tr>
              </thead>
              <tbody>
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
                    <tr
                      key={`${row.revisionId}-${row.periodStart.toISOString()}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-3">
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
                      </td>
                      <td>{formatDate(row.paymentDate)}</td>
                      <td>
                        <Badge variant={presentation.variant}>{presentation.label}</Badge>
                      </td>
                      <td className="text-right tabular-nums">
                        {formatCurrency(row.totals.earnings)}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatCurrency(row.totals.deductions)}
                      </td>
                      <td className="text-right tabular-nums">
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
                      </td>
                      <td className="text-right tabular-nums">
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
                      </td>
                      <td className="text-right tabular-nums">
                        {formatCurrency(row.totals.taxableIncome)}
                      </td>
                      <td className="text-right">
                        <PaymentDialog
                          bonuses={data.bonuses}
                          components={data.components}
                          row={row}
                          onSaved={refresh}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
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
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/40 text-muted-foreground text-left text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">Bonus</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Tax deduction</th>
                      <th className="px-4 py-3 text-right">Net pay</th>
                      <th className="w-12 px-2 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bonuses.map((bonus) => (
                      <tr key={bonus.id} className="border-t">
                        <td className="px-4 py-3">
                          <p className="font-medium">{bonus.componentName}</p>
                          <p className="text-muted-foreground text-xs">
                            Expected {formatDate(bonus.expectedDate)} ·{' '}
                            {bonus.actualAmount === null ? 'estimate' : 'reconciled'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatCurrency(bonus.actualAmount ?? bonus.estimatedAmount)}
                          {bonus.actualAmount === null ? null : (
                            <p className="text-muted-foreground text-xs font-normal">
                              Est. {formatCurrency(bonus.estimatedAmount)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {bonus.estimatedTax === null ? (
                            <span className="text-muted-foreground text-xs">In actual payroll</span>
                          ) : (
                            formatCurrency(bonus.estimatedTax)
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {bonus.estimatedNet === null ? (
                            <span className="text-muted-foreground text-xs">See actual salary</span>
                          ) : (
                            formatCurrency(bonus.estimatedNet)
                          )}
                        </td>
                        <td className="px-2 py-3 text-right">
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {estimatedBonusTotals.count === 0 ? null : (
                    <tfoot>
                      <tr className="bg-muted/30 border-t font-semibold">
                        <td className="px-4 py-3">Pending estimates total</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCurrency(estimatedBonusTotals.gross)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCurrency(estimatedBonusTotals.tax)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCurrency(estimatedBonusTotals.net)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
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
