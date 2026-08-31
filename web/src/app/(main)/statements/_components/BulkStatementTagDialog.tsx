'use client';

import { useRouter } from 'next/navigation';

import { Tag } from 'lucide-react';
import { z } from 'zod';

import { DataTableActionBarAction } from '@/components/data-table/data-table-action-bar';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { api } from '@/server/react';
import { isSelfTransfer, type SelfTransferStatement, type Statement } from '@/types';

const bulkTagSchema = z.object({
  tag: z.string().trim().min(1, 'Enter a tag'),
});

type BulkTagValues = z.infer<typeof bulkTagSchema>;

export const BulkStatementTagDialog = ({
  selectedRows,
}: {
  selectedRows: (Statement | SelfTransferStatement)[];
}) => {
  const router = useRouter();
  const mutation = api.statements.addBulkStatementTag.useMutation();
  // Suggest what is already in use so a second "Electronics" does not become
  // "electronics" — the report totals these by name.
  const { data: tags = [] } = api.statements.getTags.useQuery({});

  const taggable = selectedRows.filter((row) => !isSelfTransfer(row));
  const skipped = selectedRows.length - taggable.length;

  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const skippedNote =
    skipped === 0 ? '' : ` ${plural(skipped, 'self transfer')} cannot be tagged and will be skipped.`;
  const description = `Adds the tag to ${plural(taggable.length, 'statement')}. Any that already carry it are left alone.${skippedNote}`;

  const fields: FormField<BulkTagValues>[] = [
    {
      name: 'tag',
      label: 'Tag',
      type: 'autocompleteInput',
      placeholder: 'Setup, Electronics, …',
      options: tags.map((tag) => ({ label: tag, value: tag })),
    },
  ];

  return (
    <MutationModal
      button={
        <DataTableActionBarAction disabled={taggable.length === 0} size="icon">
          <Tag />
        </DataTableActionBarAction>
      }
      customDescription={<p>{description}</p>}
      defaultValues={{ tag: '' }}
      fields={fields}
      mutation={{
        mutateAsync: (values) =>
          mutation.mutateAsync({
            statementIds: taggable.map((row) => row.id),
            tag: values.tag,
          }),
        isPending: mutation.isPending,
      }}
      refresh={router.refresh}
      schema={bulkTagSchema}
      successToast={(result) =>
        `Tagged ${result.tagged} statement${result.tagged === 1 ? '' : 's'}.`
      }
      titleText="Tag Statements"
    />
  );
};
