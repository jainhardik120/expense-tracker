'use client';

import { useRouter } from 'next/navigation';

import { Pencil } from 'lucide-react';
import { z } from 'zod';

import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { budgetYearSchema } from '@/types/budget';

type Years = RouterOutput['budget']['getYears'];

const yearFields = [
  { name: 'name' as const, label: 'Name', type: 'input' as const },
  { name: 'startDate' as const, label: 'Starts', type: 'date' as const },
  { name: 'endDate' as const, label: 'Ends', type: 'date' as const },
];

const EditYear = ({ year }: { year: Years[number] }) => {
  const router = useRouter();
  const mutation = api.budget.updateYear.useMutation();
  return (
    <MutationModal
      button={
        <Button variant="outline">
          <Pencil />
          Edit
        </Button>
      }
      defaultValues={{
        id: year.id,
        name: year.name,
        startDate: year.startDate,
        endDate: year.endDate,
        openingBalanceLineId: year.openingBalanceLineId,
      }}
      fields={yearFields}
      mutation={mutation}
      refresh={() => {
        router.refresh();
      }}
      schema={budgetYearSchema.extend({ id: z.string() })}
      successToast={() => 'Budget year updated'}
      titleText="Edit Budget Year"
    />
  );
};

export const BudgetYearPicker = ({
  years,
  selectedId,
}: {
  years: Years;
  selectedId: string | null;
}) => {
  const router = useRouter();
  const mutation = api.budget.createYear.useMutation();
  const selected = years.find((year) => year.id === selectedId);

  const newYearForm = (
    <MutationModal
      button={<Button variant="outline">New Budget Year</Button>}
      defaultValues={{ name: '', startDate: new Date(), endDate: new Date() }}
      fields={yearFields}
      mutation={mutation}
      refresh={() => {
        router.refresh();
      }}
      schema={budgetYearSchema}
      successToast={() => 'Budget year created'}
      titleText="New Budget Year"
    />
  );

  if (years.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No budget yet</CardTitle>
          <CardDescription>
            A budget year is any span you want to plan over — it does not have to start in January.
          </CardDescription>
        </CardHeader>
        <CardContent>{newYearForm}</CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Budget year:</span>
      <Select
        value={selectedId ?? undefined}
        onValueChange={(value) => {
          router.push(`/budget?year=${value}`);
        }}
      >
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((year) => (
            <SelectItem key={year.id} value={year.id}>
              {year.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected === undefined ? null : <EditYear key={selected.id} year={selected} />}
      {newYearForm}
    </div>
  );
};
