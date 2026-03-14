'use client';

import { useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { CircleOff, SquarePen } from 'lucide-react';
import { type ControllerRenderProps, useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Button } from '@/components/ui/button';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import {
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

const stockSearchHelperTextByMarket: Record<(typeof stockMarketValues)[number], string> = {
  IN: 'Searches Yahoo Finance symbols for Indian exchanges (NSE/BSE).',
  US: 'Searches Yahoo Finance symbols for US exchanges (NYSE/NASDAQ).',
};

const getInstrumentSearchHelperText = (
  kind: InvestmentKindValue,
  stockMarket: (typeof stockMarketValues)[number],
) => {
  if (kind === 'stocks') {
    return stockSearchHelperTextByMarket[stockMarket];
  }
  return instrumentSearchHelperText[kind];
};

const instrumentSearchHelperText: Record<InvestmentKindValue, string> = {
  stocks: stockSearchHelperTextByMarket.IN,
  mutual_funds: 'Searches mfapi.in scheme directory.',
  crypto: 'Searches CoinGecko coin ids.',
  commodities: 'Searches supported commodities like gold and silver.',
  fd: 'Searches preset Indian FD issuers.',
  epfo: 'Optional custom EPFO label. EPFO is excluded from portfolio totals and timeline.',
  other: 'Enter a custom instrument code.',
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
  }, 300);
  const normalizedKind = normalizeInvestmentKind(investmentKind);
  const normalizedStockMarket = normalizeStockMarket(stockMarket);
  const currentValue = typeof field.value === 'string' ? field.value : '';

  useEffect(() => {
    debouncedSetSearchQuery(currentValue);
  }, [currentValue, debouncedSetSearchQuery]);

  const { data, isFetching } = api.investments.searchInstruments.useQuery(
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
    const results = data ?? [];
    const deduped = new Map<string, string>();
    for (const item of results) {
      if (item.code === '') {
        continue;
      }
      deduped.set(item.code, `${item.name} (${item.code})`);
    }
    return [...deduped.entries()].map(([value, label]) => ({
      value,
      label,
    }));
  }, [data]);

  const helperText = getInstrumentSearchHelperText(normalizedKind, normalizedStockMarket);
  let placeholder = instrumentCodePlaceholders[normalizedKind];
  if (normalizedKind === 'stocks') {
    placeholder =
      normalizedStockMarket === 'US'
        ? 'Search US stock (e.g. CSCO)'
        : 'Search Indian stock (e.g. RELIANCE)';
  }

  return (
    <div className="grid gap-2">
      <Autocomplete
        options={options}
        placeholder={placeholder}
        value={currentValue}
        onValueChange={(nextValue) => {
          field.onChange(nextValue);
        }}
      />
      <p className="text-muted-foreground text-xs">
        {isFetching ? 'Searching instruments...' : helperText}
      </p>
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
    description:
      'Search and select code by type. Stocks: choose market first, Mutual Funds: scheme code, Crypto: CoinGecko id, Commodities: gold/silver, FD: issuer code.',
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
    type: 'datetime',
  },
  {
    name: 'investmentAmount',
    label: 'Investment Amount',
    type: 'number',
    description:
      'Enter INR for Indian investments. For US stocks, enter USD amount (auto-converted to INR in dashboard/table).',
    placeholder: 'Investment Amount',
    min: 0,
    max: 9999999999,
    step: 0.01,
  },
  {
    name: 'maturityDate',
    label: 'Maturity Date',
    type: 'datetime',
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
    type: 'number',
    placeholder: 'Number of units',
    min: 0,
    max: 9999999999,
    step: 0.00000001,
    displayCondition: (values) =>
      requiresInstrumentCode(normalizeInvestmentKind(values.investmentKind)),
  },
];

export const CreateInvestmentForm = () => {
  const mutation = api.investments.addInvestment.useMutation();
  const router = useRouter();

  return (
    <MutationModal
      button={
        <Button className="h-8" variant="outline">
          New Investment
        </Button>
      }
      defaultValues={{
        investmentKind: 'stocks',
        instrumentCode: '',
        stockMarket: 'IN',
        isRsu: false,
        investmentDate: new Date(),
        investmentAmount: '',
        maturityDate: new Date(),
        maturityAmount: '',
        units: '',
        annualRate: '',
      }}
      fields={investmentFormFields}
      mutation={mutation}
      refresh={() => {
        router.refresh();
      }}
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
}: {
  refresh?: () => void;
  investmentId: string;
  initialData: Investment & {
    normalizedKind?: string;
  };
}) => {
  const mutation = api.investments.updateInvestment.useMutation();
  const normalizedKind = normalizeInvestmentKind(
    initialData.normalizedKind ?? initialData.investmentKind,
  );

  return (
    <MutationModal
      button={
        <Button className="size-8" size="icon" variant="ghost">
          <SquarePen />
        </Button>
      }
      defaultValues={{
        investmentKind: normalizedKind,
        instrumentCode: initialData.instrumentCode ?? '',
        stockMarket: normalizeStockMarket(initialData.stockMarket),
        isRsu: initialData.isRsu,
        investmentDate: initialData.investmentDate,
        investmentAmount: initialData.investmentAmount,
        maturityDate: initialData.maturityDate ?? new Date(),
        maturityAmount: initialData.maturityAmount ?? '',
        units: initialData.units ?? '',
        annualRate: initialData.annualRate ?? '',
      }}
      fields={investmentFormFields}
      mutation={{
        ...mutation,
        mutateAsync: (values) => {
          return mutation.mutateAsync({
            id: investmentId,
            createInvestmentSchema: values,
          });
        },
      }}
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
}: {
  investmentId: string;
  refresh?: () => void;
}) => {
  const closeMutation = api.investments.closeInvestment.useMutation();

  return (
    <MutationModal
      button={
        <Button className="size-8" size="icon" variant="ghost">
          <CircleOff />
        </Button>
      }
      defaultValues={{
        closedAt: new Date(),
        closedAmount: '',
      }}
      fields={closeInvestmentFields}
      mutation={{
        ...closeMutation,
        mutateAsync: (values) => {
          return closeMutation.mutateAsync({
            id: investmentId,
            ...values,
          });
        },
      }}
      refresh={refresh}
      schema={closeInvestmentSchema}
      successToast={() => 'Investment closed'}
      titleText="Close Investment"
    />
  );
};
