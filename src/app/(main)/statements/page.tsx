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
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-2">
        <CreateSelfTransferStatementForm refresh={refetchSelfTransferStatements} />
        <CreateStatementForm refresh={refetchStatements} />
      </div>
      <DataTable columns={columns} data={mergedData} />
    </div>
  );
}
