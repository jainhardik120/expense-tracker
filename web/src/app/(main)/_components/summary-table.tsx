'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { type RouterOutput } from '@/server/routers';
import { isFriendSummary } from '@/types';

import { createAccountColumns } from './account-columns';
import { CreateAccountForm } from './account-forms';
import { CreateFriendForm } from './friend-forms';

type SummaryData = RouterOutput['summary']['getAggregatedData'];
type CreditData = RouterOutput['accounts']['getCreditCards'];

const Table = ({ data, creditData }: { data: SummaryData; creditData: CreditData }) => {
  const router = useRouter();
  const refetch = () => {
    router.refresh();
  };
  const accountColumns = createAccountColumns(refetch);
  const accountsDataWithCreditData = useMemo(() => {
    return data.accountsSummary.map((account) => {
      const creditAccount = creditData.find((credit) => credit.accountId === account.account.id);
      return {
        ...account,
        creditCardId: creditAccount?.id,
        creditAccountId: creditAccount?.accountId,
        cardLimit: creditAccount?.cardLimit,
        billingDate: creditAccount?.billingDate,
      };
    });
  }, [data, creditData]);
  const { table } = useDataTable({
    data: [...accountsDataWithCreditData, ...data.friendsSummary],
    columns: accountColumns,
    pageCount: -1,
    shallow: false,
    initialState: {
      columnPinning: {
        left: ['name'],
      },
    },
  });
  // Accounts and friends both filter statements through the same `account` param.
  const openStatements = (item: (typeof table)['options']['data'][number]) => {
    const id = isFriendSummary(item) ? item.friend.id : item.account.id;
    router.push(`/statements?account=${id}`);
  };

  return (
    <DataTable
      enablePagination={false}
      getItemValue={(item) => (isFriendSummary(item) ? item.friend.id : item.account.id)}
      table={table}
      onRowClick={openStatements}
    >
      <DataTableToolbar table={table}>
        <CreateAccountForm refresh={refetch} />
        <CreateFriendForm refresh={refetch} />
      </DataTableToolbar>
    </DataTable>
  );
};

export default Table;
