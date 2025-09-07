'use client';

import { useQueryStates } from 'nuqs';

import {
  DataTableContent,
  DataTableFooter,
  DataTableHeader,
  DataTableProvider,
  DataTableSearchBox,
  DataTableColumnSelect,
} from '@/components/ui/data-table';
import { api } from '@/server/react';
import { statementParser } from '@/types';

import FilterPanel from './filter-panel';
import { CreateSelfTransferStatementForm } from './SelfTransferStatementForms';
import { createStatementColumns } from './StatementColumns';
import { CreateStatementForm } from './StatementForms';

export default function Page() {
  const [params] = useQueryStates(statementParser);
  const { data: statements = [], refetch: refetchStatements } =
    api.statements.getStatements.useQuery(params);
  const columns = createStatementColumns(refetchStatements);
  return (
    <DataTableProvider columns={columns} data={statements}>
      <DataTableHeader>
        <DataTableColumnSelect />
        <DataTableSearchBox name="Statements" searchOn="statementKind" />
        <FilterPanel />
        <CreateSelfTransferStatementForm refresh={refetchStatements} />
        <CreateStatementForm refresh={refetchStatements} />
      </DataTableHeader>
      <DataTableContent />
      <DataTableFooter />
    </DataTableProvider>
  );
}
