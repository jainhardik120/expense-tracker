'use client';

import DataTable from '@/components/ui/data-table';
import { api } from '@/server/react';

import { CreateSelfTransferStatementForm } from './SelfTransferStatementForms';
import { createStatementColumns } from './StatementColumns';
import { CreateStatementForm } from './StatementForms';

export default function Page() {
  const { data: statements = [], refetch: refetchStatements } =
    api.statements.getStatements.useQuery();
  const columns = createStatementColumns(refetchStatements);
  return (
    <DataTable
      CreateButton={
        <div className="flex gap-4">
          <CreateSelfTransferStatementForm refresh={refetchStatements} />
          <CreateStatementForm refresh={refetchStatements} />
        </div>
      }
      columns={columns}
      data={statements}
      filterOn="statementKind"
      name="Statements"
    />
  );
}
