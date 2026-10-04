'use client';

import { CheckCheck } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import {
  DataTableActionBar,
  DataTableActionBarAction,
  DataTableActionBarSelection,
} from '@/components/data-table/data-table-action-bar';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Separator } from '@/components/ui/separator';
import { useDataTable } from '@/hooks/use-data-table';
import { type RouterOutput } from '@/server/routers';
import { type Account, type Friend } from '@/types';

import { FriendsDialog } from './friends-dialog';
import { createInboxColumns } from './inbox-columns';
import { ResolveInboxDialog } from './resolve-inbox-dialog';

type InboxData = RouterOutput['friends']['getInbox'];

const InboxTable = ({
  data,
  accountsData,
  friendsData,
  categories,
}: {
  data: InboxData;
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
}) => {
  const columns = createInboxColumns({ accountsData, friendsData, categories });
  const { table } = useDataTable({
    data: data.entries,
    columns,
    pageCount: data.pageCount,
    shallow: false,
    getRowId: (row) => row.id,
    initialState: { sorting: [{ id: 'date', desc: true }] },
    enableSortingRemoval: false,
  });
  const selected = table.getFilteredSelectedRowModel().rows.map((row) => row.original);

  return (
    <DataTable
      actionBar={
        <DataTableActionBar table={table} visible={selected.length > 0}>
          <DataTableActionBarSelection table={table} />
          <Separator
            className="hidden data-[orientation=vertical]:h-5 sm:block"
            orientation="vertical"
          />
          <ResolveInboxDialog
            accountsData={accountsData}
            categories={categories}
            entries={selected}
            trigger={
              <DataTableActionBarAction size="icon" tooltip="Resolve selected">
                <CheckCheck />
              </DataTableActionBarAction>
            }
          />
        </DataTableActionBar>
      }
      fill
      getItemValue={(item) => item.id}
      table={table}
    >
      <DataTableToolbar table={table}>
        <FriendsDialog />
      </DataTableToolbar>
    </DataTable>
  );
};

export default InboxTable;
