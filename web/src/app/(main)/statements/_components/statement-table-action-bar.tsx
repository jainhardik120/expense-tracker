import {
  DataTableActionBar,
  DataTableActionBarSelection,
} from '@/components/data-table/data-table-action-bar';
import { Separator } from '@/components/ui/separator';
import type { Table } from '@/lib/table';
import type { SelfTransferStatement, Statement } from '@/types';

import { BulkStatementTagDialog } from './bulk-statement-tag-dialog';
import { BulkStatementSplitsDialog } from './statement-splits';

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
        <BulkStatementTagDialog selectedRows={rows.map((row) => row.original)} />
      </div>
    </DataTableActionBar>
  );
};

export default StatementTableActionBar;
