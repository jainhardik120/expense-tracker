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
} from '@/lib/investments';
import { api } from '@/server/react';
import { amount, createInvestmentSchema, type Investment } from '@/types';

const investmentKindOptions = investmentKindValues.map((kind) => ({
  label: investmentKindLabels[kind],
  value: kind,
}));

const requiresInstrumentCode = (kind: z.infer<typeof createInvestmentSchema>['investmentKind']) => {
  return isUnitBasedInvestment(kind);
};

type InvestmentFormInput = z.input<typeof createInvestmentSchema>;

const instrumentCodePlaceholders: Record<InvestmentKindValue, string> = {
  stocks: 'Search stock (e.g. Reliance)',
  mutual_funds: 'Search mutual fund (e.g. Parag Parikh)',
  crypto: 'Search crypto (e.g. bitcoin)',
  fd: 'Search FD issuer (e.g. SBI)',
  other: 'Enter instrument code',
};

const instrumentSearchHelperText: Record<InvestmentKindValue, string> = {
  stocks: 'Searches Yahoo Finance symbols for Indian exchanges.',
  mutual_funds: 'Searches mfapi.in scheme directory.',
  crypto: 'Searches CoinGecko coin ids.',
  fd: 'Searches preset Indian FD issuers.',
  other: 'Enter a custom instrument code.',
};

const InstrumentCodeAutocomplete = ({
  field,
}: {
  field: ControllerRenderProps<InvestmentFormInput, 'instrumentCode'>;
}) => {
  const { control } = useFormContext<InvestmentFormInput>();
  const investmentKind = useWatch({ control, name: 'investmentKind' });
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSetSearchQuery = useDebouncedCallback((next: string) => {
    setSearchQuery(next.trim());
  }, 300);
  const normalizedKind = normalizeInvestmentKind(investmentKind);
  const currentValue = typeof field.value === 'string' ? field.value : '';

  useEffect(() => {
    debouncedSetSearchQuery(currentValue);
  }, [currentValue, debouncedSetSearchQuery]);

  const { data, isFetching } = api.investments.searchInstruments.useQuery(
    {
      kind: normalizedKind,
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

  const helperText = instrumentSearchHelperText[normalizedKind];

  return (
    <div className="grid gap-2">
      <Autocomplete
        options={options}
        placeholder={instrumentCodePlaceholders[normalizedKind]}
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
    name: 'instrumentCode',
    label: 'Instrument Code',
    type: 'custom',
    description:
      'Search and select code by type. Stocks: NSE/BSE symbol, Mutual Funds: scheme code, Crypto: CoinGecko id, FD: issuer code.',
    render: (field) => (
      <InstrumentCodeAutocomplete
        field={field as ControllerRenderProps<InvestmentFormInput, 'instrumentCode'>}
      />
    ),
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
  {
    name: 'purchaseRate',
    label: 'Purchase Rate (Optional)',
    type: 'number',
    placeholder: 'Price per unit in INR',
    min: 0,
    max: 9999999999,
    step: 0.00000001,
    displayCondition: (values) =>
      requiresInstrumentCode(normalizeInvestmentKind(values.investmentKind)),
  },
  {
    name: 'amount',
    label: 'Manual Current Value (Optional)',
    type: 'number',
    placeholder: 'Used when live quote is unavailable',
    min: 0,
    max: 9999999999,
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
        investmentDate: new Date(),
        investmentAmount: '',
        maturityDate: new Date(),
        maturityAmount: '',
        amount: '',
        units: '',
        purchaseRate: '',
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
        investmentDate: initialData.investmentDate,
        investmentAmount: initialData.investmentAmount,
        maturityDate: initialData.maturityDate ?? new Date(),
        maturityAmount: initialData.maturityAmount ?? '',
        amount: initialData.amount ?? '',
        units: initialData.units ?? '',
        purchaseRate: initialData.purchaseRate ?? '',
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
