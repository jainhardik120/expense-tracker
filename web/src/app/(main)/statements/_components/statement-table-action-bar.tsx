import {
  DataTableActionBar,
  DataTableActionBarSelection,
} from '@/components/data-table/data-table-action-bar';
import { Separator } from '@/components/ui/separator';
import type { SelfTransferStatement, Statement } from '@/types';

import { BulkStatementSplitsDialog } from './StatementSplits';

import type { Table } from '@tanstack/react-table';

const StatementTableActionBar = ({
  table,
}: {
  table: Table<Statement | SelfTransferStatement>;
}) => {
  const { rows } = table.getFilteredSelectedRowModel();
  return (
    <DataTableActionBar table={table} visible={rows.length > 0}>
      <DataTableActionBarSelection table={table} />
      <Separator
        className="hidden data-[orientation=vertical]:h-5 sm:block"
        orientation="vertical"
      />
      <div className="flex items-center gap-1.5">
        <BulkStatementSplitsDialog selectedRows={rows.map((row) => row.original)} />
      </div>
    </DataTableActionBar>
  );
};

export default StatementTableActionBar;
