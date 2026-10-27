'use client';

import { useRouter } from 'next/navigation';

import { Copy } from 'lucide-react';
import { z } from 'zod';

import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

type Years = RouterOutput['budget']['getYears'];

const plural = (count: number, word: string) => `${String(count)} ${word}${count === 1 ? '' : 's'}`;

export const CopyLinesFromYear = ({
  budgetYearId,
  years,
}: {
  budgetYearId: string;
  years: Years;
}) => {
  const router = useRouter();
  const mutation = api.budget.copyLinesFromYear.useMutation();
  const target = years.find((year) => year.id === budgetYearId);
  const others = years.filter((year) => year.id !== budgetYearId);
  if (target === undefined || others.length === 0) {
    return null;
  }
  const previous =
    others.findLast((year) => year.startDate < target.startDate) ?? others.at(-1) ?? others[0];
  return (
    <MutationModal
      button={
        <Button variant="outline">
          <Copy />
          Copy lines from another year
        </Button>
      }
      defaultValues={{ budgetYearId, sourceYearId: previous.id }}
      fields={[
        {
          name: 'sourceYearId' as const,
          label: 'Copy lines from',
          type: 'select' as const,
          description:
            'Copies every budget line and income line with its rule and amounts. Lines this year already has, by name, are left alone, and copied lines start open even if they were done for the year. Edit or delete any you do not need.',
          options: others.map((year) => ({ label: year.name, value: year.id })),
        },
      ]}
      mutation={mutation}
      refresh={() => {
        router.refresh();
      }}
      schema={z.object({ budgetYearId: z.string(), sourceYearId: z.string() })}
      successToast={(result) =>
        `Copied ${plural(result.addedLines, 'budget line')} and ${plural(result.addedIncome, 'income line')}`
      }
      titleText={`Copy lines into ${target.name}`}
    />
  );
};
