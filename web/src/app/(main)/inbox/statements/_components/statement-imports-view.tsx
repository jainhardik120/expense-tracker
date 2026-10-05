'use client';

import { useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { Upload } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { importColumns } from './import-columns';
import { RecognisedCards } from './recognised-cards';

import { StatementImporter } from '../../_components/statement-importer';

type Imports = RouterOutput['statementImports']['list'];
type Sources = RouterOutput['statementImports']['listSources'];

export const StatementImportsView = ({
  imports,
  accounts,
  sources,
}: {
  imports: Imports;
  accounts: Array<{ id: string; accountName: string }>;
  sources: Sources;
}) => {
  const router = useRouter();
  const refresh = api.statementImports.refreshChecks.useMutation();
  const { mutate } = refresh;
  useEffect(() => {
    mutate(undefined, {
      onSuccess: (refreshed) => {
        if (refreshed > 0) {
          router.refresh();
        }
      },
    });
  }, [mutate, router]);
  const { table } = useDataTable({
    data: imports,
    columns: importColumns(
      refresh.isPending,
      [...new Map(imports.map((row) => [row.accountId, row.accountName])).entries()]
        .map(([value, label]) => ({ label, value }))
        .toSorted((left, right) => left.label.localeCompare(right.label)),
    ),
    pageCount: -1,
    manualFiltering: false,
  });
  return (
    <DataTable enablePagination={false} getItemValue={(item) => item.id} table={table}>
      <DataTableToolbar table={table}>
        <RecognisedCards sources={sources} />
        <StatementImporter
          accounts={accounts}
          trigger={
            <Button className="h-8">
              <Upload className="size-4" />
              Import statement PDFs
            </Button>
          }
        />
      </DataTableToolbar>
    </DataTable>
  );
};
