'use client';

import { useEffect, useMemo, useState } from 'react';

import { type ControllerRenderProps, useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import { type DialogControl } from '@/components/modal';
import MutationModal from '@/components/mutation-modal';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { formatCurrency } from '@/lib/format';
import {
  assetClassLabels,
  assetClassTagValues,
  type AssetClassTagValue,
  type InvestmentKindValue,
  investmentKindLabels,
  investmentKindValues,
  isUnitBasedInvestment,
  normalizeInvestmentKind,
  normalizeStockMarket,
  stockMarketLabels,
  stockMarketValues,
} from '@/lib/investments';
import { api } from '@/server/react';
import { amount, createInvestmentSchema, type Investment } from '@/types';

const SEARCH_DEBOUNCE_MS = 300;
const NOON_HOUR = 12;
const MAX_UNITS = 9999999999;
const UNIT_STEP = 0.00000001;

const todayAtNoon = () => {
  const today = new Date();
  today.setHours(NOON_HOUR, 0, 0, 0);
  return today;
};

const investmentKindOptions = investmentKindValues.map((kind) => ({
  label: investmentKindLabels[kind],
  value: kind,
}));

const stockMarketOptions = stockMarketValues.map((market) => ({
  label: stockMarketLabels[market],
  value: market,
}));

const requiresInstrumentCode = (kind: z.infer<typeof createInvestmentSchema>['investmentKind']) => {
  return isUnitBasedInvestment(kind);
};

type InvestmentFormInput = z.input<typeof createInvestmentSchema>;

const instrumentCodePlaceholders: Record<InvestmentKindValue, string> = {
  stocks: 'Search stock',
  mutual_funds: 'Search mutual fund (e.g. Parag Parikh)',
  crypto: 'Search crypto (e.g. bitcoin)',
  commodities: 'Search commodity (e.g. gold)',
  fd: 'Search FD issuer (e.g. SBI)',
  epfo: 'Enter EPFO account label',
  other: 'Enter instrument code',
};

const InstrumentCodeAutocomplete = ({
  field,
}: {
  field: ControllerRenderProps<InvestmentFormInput, 'instrumentCode'>;
}) => {
  const { control } = useFormContext<InvestmentFormInput>();
  const investmentKind = useWatch({ control, name: 'investmentKind' });
  const stockMarket = useWatch({ control, name: 'stockMarket' });
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSetSearchQuery = useDebouncedCallback((next: string) => {
    setSearchQuery(next.trim());
  }, SEARCH_DEBOUNCE_MS);
  const normalizedKind = normalizeInvestmentKind(investmentKind);
  const normalizedStockMarket = normalizeStockMarket(stockMarket);
  const currentValue = typeof field.value === 'string' ? field.value : '';

  useEffect(() => {
    debouncedSetSearchQuery(currentValue);
  }, [currentValue, debouncedSetSearchQuery]);

  const { data: pastInstruments } = api.investments.getPastInstruments.useQuery();
  const { data } = api.investments.searchInstruments.useQuery(
    {
      kind: normalizedKind,
      stockMarket: normalizedStockMarket,
      query: searchQuery,
    },
    {
      enabled: searchQuery.length >= 2,
    },
  );

  const options = useMemo(() => {
    const past = (pastInstruments ?? []).filter(
      (item) =>
        item.kind === normalizedKind &&
        (normalizedKind !== 'stocks' || item.stockMarket === normalizedStockMarket),
    );
    const deduped = new Map<string, string>();
    for (const item of [...past, ...(data ?? [])]) {
      if (item.code !== '' && !deduped.has(item.code)) {
        deduped.set(item.code, `${item.name} (${item.code})`);
      }
    }
    return [...deduped.entries()].map(([value, label]) => ({
      value,
      label,
    }));
  }, [data, normalizedKind, normalizedStockMarket, pastInstruments]);

  let placeholder = instrumentCodePlaceholders[normalizedKind];
  if (normalizedKind === 'stocks') {
    placeholder =
      normalizedStockMarket === 'US'
        ? 'Search US stock (e.g. CSCO)'
        : 'Search Indian stock (e.g. RELIANCE)';
  }

  return (
    <Autocomplete
      keepOrder
      options={options}
      placeholder={placeholder}
      value={currentValue}
      onValueChange={(nextValue) => {
        field.onChange(nextValue);
      }}
    />
  );
};

const UnitsInput = ({ field }: { field: ControllerRenderProps<InvestmentFormInput, 'units'> }) => {
  const { control } = useFormContext<InvestmentFormInput>();
  const [investmentAmount, investmentKind, stockMarket] = useWatch({
    control,
    name: ['investmentAmount', 'investmentKind', 'stockMarket'],
  });
  const units = Number(field.value);
  const total = Number(investmentAmount);
  const isUs =
    normalizeInvestmentKind(investmentKind) === 'stocks' &&
    normalizeStockMarket(stockMarket) === 'US';
  return (
    <div className="grid gap-2">
      <Input
        max={MAX_UNITS}
        min={0}
        placeholder="Number of units"
        step={UNIT_STEP}
        type="number"
        {...field}
      />
      {units > 0 && total > 0 ? (
        <p className="text-muted-foreground text-xs">
          {formatCurrency(total / units, isUs ? 'USD' : 'INR')} per unit
        </p>
      ) : null}
    </div>
  );
};

const investmentFormFields: FormField<InvestmentFormInput>[] = [
  {
    name: 'investmentKind',
    label: 'Investment Type',
    type: 'select',
    options: investmentKindOptions,
  },
  {
    name: 'stockMarket',
    label: 'Stock Market',
    type: 'select',
    options: stockMarketOptions,
    placeholder: 'Select stock market',
    displayCondition: (values) => normalizeInvestmentKind(values.investmentKind) === 'stocks',
  },
  {
    name: 'instrumentCode',
    label: 'Instrument Code',
    type: 'custom',
    render: (field) => (
      <InstrumentCodeAutocomplete
        field={field as ControllerRenderProps<InvestmentFormInput, 'instrumentCode'>}
      />
    ),
  },
  {
    name: 'isRsu',
    label: 'Mark as RSU (excluded from portfolio totals/graph)',
    type: 'checkbox',
    displayCondition: (values) => normalizeInvestmentKind(values.investmentKind) === 'stocks',
  },
  {
    name: 'investmentDate',
    label: 'Investment Date',
    type: 'date',
  },
  {
    name: 'investmentAmount',
    label: 'Investment Amount',
    type: 'number',
    placeholder: 'Investment Amount',
    min: 0,
    max: 9999999999,
    step: 0.01,
  },
  {
    name: 'maturityDate',
    label: 'Maturity Date',
    type: 'date',
    displayCondition: (values) => normalizeInvestmentKind(values.investmentKind) === 'fd',
  },
  {
    name: 'maturityAmount',
    label: 'Maturity Amount',
    type: 'number',
    placeholder: 'Maturity Amount',
    min: 0,
    max: 9999999999,
    step: 0.01,
    displayCondition: (values) => normalizeInvestmentKind(values.investmentKind) === 'fd',
  },
  {
    name: 'annualRate',
    label: 'Annual Interest Rate (%)',
    type: 'number',
    placeholder: 'e.g. 7.5',
    min: 0,
    max: 100,
    step: 0.01,
    displayCondition: (values) => normalizeInvestmentKind(values.investmentKind) === 'fd',
  },
  {
    name: 'units',
    label: 'Units / Quantity',
    type: 'custom',
    render: (field) => (
      <UnitsInput field={field as ControllerRenderProps<InvestmentFormInput, 'units'>} />
    ),
    displayCondition: (values) =>
      requiresInstrumentCode(normalizeInvestmentKind(values.investmentKind)),
  },
];

export const CreateInvestmentForm = ({
  refresh,
  prefill,
  dialog,
}: {
  refresh: () => Promise<void> | void;
  prefill?: {
    investmentKind: InvestmentKindValue;
    instrumentCode: string;
    stockMarket: (typeof stockMarketValues)[number];
    isRsu: boolean;
  };
  dialog?: DialogControl;
}) => {
  const mutation = api.investments.createInvestment.useMutation();

  return (
    <MutationModal
      button={
        dialog === undefined ? (
          <Button className="h-8" variant="outline">
            New Investment
          </Button>
        ) : undefined
      }
      defaultValues={{
        investmentKind: 'stocks',
        instrumentCode: '',
        stockMarket: 'IN',
        isRsu: false,
        investmentDate: todayAtNoon(),
        investmentAmount: '',
        maturityDate: todayAtNoon(),
        maturityAmount: '',
        units: '',
        annualRate: '',
        ...prefill,
      }}
      dialog={dialog}
      fields={investmentFormFields}
      mutation={mutation}
      refresh={refresh}
      schema={createInvestmentSchema}
      successToast={(result) => `${result.length} investment(s) created`}
      titleText="Add Investment"
    />
  );
};

export const UpdateInvestmentForm = ({
  refresh,
  investmentId,
  initialData,
  dialog,
}: {
  refresh?: () => void;
  investmentId: string;
  initialData: Investment & {
    normalizedKind?: string;
    rsuGrant?: { units: string | null; investmentAmount: string };
  };
  dialog: DialogControl;
}) => {
  const mutation = api.investments.updateInvestment.useMutation();
  const normalizedKind = normalizeInvestmentKind(
    initialData.normalizedKind ?? initialData.investmentKind,
  );

  return (
    <MutationModal
      defaultValues={{
        investmentKind: normalizedKind,
        instrumentCode: initialData.instrumentCode ?? '',
        stockMarket: normalizeStockMarket(initialData.stockMarket),
        isRsu: initialData.isRsu,
        investmentDate: initialData.investmentDate,
        investmentAmount: initialData.rsuGrant?.investmentAmount ?? initialData.investmentAmount,
        maturityDate: initialData.maturityDate ?? new Date(),
        maturityAmount: initialData.maturityAmount ?? '',
        units: initialData.rsuGrant?.units ?? initialData.units ?? '',
        annualRate: initialData.annualRate ?? '',
      }}
      dialog={dialog}
      fields={investmentFormFields}
      mapInput={(values) => ({
        id: investmentId,
        createInvestmentSchema: values,
      })}
      mutation={mutation}
      refresh={refresh}
      schema={createInvestmentSchema}
      successToast={(result) => `${result.length} investment(s) updated`}
      titleText="Update Investment"
    />
  );
};

const closeInvestmentSchema = z.object({
  closedAt: z.date(),
  closedAmount: amount,
});

const closeInvestmentFields: FormField<z.input<typeof closeInvestmentSchema>>[] = [
  {
    name: 'closedAt',
    label: 'Closed Date',
    type: 'datetime',
  },
  {
    name: 'closedAmount',
    label: 'Closed Amount (INR)',
    type: 'number',
    min: 0,
    max: 9999999999,
  },
];

export const CloseInvestmentForm = ({
  investmentId,
  refresh,
  dialog,
}: {
  investmentId: string;
  refresh?: () => void;
  dialog: DialogControl;
}) => {
  const closeMutation = api.investments.closeInvestment.useMutation();

  return (
    <MutationModal
      defaultValues={{
        closedAt: new Date(),
        closedAmount: '',
      }}
      dialog={dialog}
      fields={closeInvestmentFields}
      mapInput={(values) => ({
        id: investmentId,
        ...values,
      })}
      mutation={closeMutation}
      refresh={refresh}
      schema={closeInvestmentSchema}
      successToast={() => 'Investment closed'}
      titleText="Close Investment"
    />
  );
};

export const DeleteInvestmentDialog = ({
  investmentId,
  refresh,
  dialog,
}: {
  investmentId: string;
  refresh: () => void;
  dialog: DialogControl;
}) => {
  const mutation = api.investments.deleteInvestment.useMutation();
  return (
    <DeleteConfirmationDialog
      dialog={dialog}
      mutation={mutation}
      mutationInput={{ id: investmentId }}
      refresh={refresh}
    />
  );
};

const UNTAGGED_ASSET_CLASS = 'market';

const assetClassChoices = [UNTAGGED_ASSET_CLASS, ...assetClassTagValues] as const;

const assetClassSchema = z.object({
  assetClass: z.enum(assetClassChoices),
});

const assetClassFields: FormField<z.input<typeof assetClassSchema>>[] = [
  {
    name: 'assetClass',
    label: 'Asset Class',
    type: 'select',
    options: assetClassChoices.map((value) => ({
      label: assetClassLabels[value],
      value,
    })),
  },
];

export const AssetClassForm = ({
  kind,
  code,
  name,
  assetClass,
  refresh,
  dialog,
}: {
  kind: InvestmentKindValue;
  code: string;
  name: string;
  assetClass: AssetClassTagValue | null;
  refresh?: () => Promise<void> | void;
  dialog: DialogControl;
}) => {
  const mutation = api.investments.setAssetClass.useMutation();
  const selected: (typeof assetClassChoices)[number] = assetClass ?? UNTAGGED_ASSET_CLASS;

  return (
    <MutationModal
      defaultValues={{ assetClass: selected }}
      dialog={dialog}
      fields={assetClassFields}
      mapInput={(values) => ({
        kind,
        code,
        assetClass: values.assetClass === UNTAGGED_ASSET_CLASS ? null : values.assetClass,
      })}
      modalDescription={name}
      mutation={mutation}
      refresh={refresh}
      schema={assetClassSchema}
      successToast={() => 'Asset class updated'}
      titleText="Edit Asset Class"
    />
  );
};
