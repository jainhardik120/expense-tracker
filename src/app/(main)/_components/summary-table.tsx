'use client';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { type RouterOutput } from '@/server/routers';
import { isFriendSummary } from '@/types';

import { createAccountColumns } from './AccountColumns';
import { CreateAccountForm } from './AccountForms';
import { CreateFriendForm } from './FriendsForms';

type SummaryData = RouterOutput['summary']['getSummary'];

const Table = ({ data }: { data: SummaryData }) => {
  const router = useRouter();
  const refetch = () => {
    router.refresh();
  };
  const accountColumns = createAccountColumns(refetch);
  const { table } = useDataTable({
    data: [...data.accountsSummaryData, ...data.friendsSummaryData],
    columns: accountColumns,
    pageCount: -1,
    shallow: false,
  });
  return (
    <DataTable
      enablePagination={false}
      getItemValue={(item) => (isFriendSummary(item) ? item.friend.id : item.account.id)}
      table={table}
    >
      <DataTableToolbar table={table}>
        <CreateAccountForm refresh={refetch} />
        <CreateFriendForm refresh={refetch} />
      </DataTableToolbar>
    </DataTable>
  );
};

export default Table;
