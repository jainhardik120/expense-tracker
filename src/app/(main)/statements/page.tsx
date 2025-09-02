'use client';

import { useMemo } from 'react';

import DataTable from '@/components/ui/data-table';
import { api } from '@/server/react';

import { CreateSelfTransferStatementForm } from './SelfTransferStatementForms';
import { createStatementColumns } from './StatementColumns';
import { CreateStatementForm } from './StatementForms';

export default function Page() {
  const { data: statements = [], refetch: refetchStatements } =
    api.statements.getStatements.useQuery();
  const { data: selfTransferStatements = [], refetch: refetchSelfTransferStatements } =
    api.statements.getSelfTransferStatements.useQuery();
  const columns = createStatementColumns(refetchStatements, refetchSelfTransferStatements);
  const mergedData = useMemo(
    () =>
      [...statements, ...selfTransferStatements].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [statements, selfTransferStatements],
  );
  return (
    <DataTable
      CreateButton={
        <div className="flex gap-4">
          <CreateSelfTransferStatementForm refresh={refetchSelfTransferStatements} />
          <CreateStatementForm refresh={refetchStatements} />
        </div>
      }
      columns={columns}
      data={mergedData}
      filterOn="category"
      name="Statements"
    />
  );
}
