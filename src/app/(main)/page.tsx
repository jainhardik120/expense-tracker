'use client';

import {
  DataTableContent,
  DataTableFooter,
  DataTableHeader,
  DataTableProvider,
  DataTableSearchBox,
  DataTableColumnSelect,
} from '@/components/ui/data-table';
import { api } from '@/server/react';
import { defaultAccountSummary, defaultFriendSummary } from '@/types';

import { createAccountColumns } from './_components/AccountColumns';
import { CreateAccountForm } from './_components/AccountForms';
import { createFriendsColumns } from './_components/FriendsColumns';
import { CreateFriendForm } from './_components/FriendsForms';

export default function Page() {
  const {
    data = {
      accountsSummaryData: [],
      friendsSummaryData: [],
      myExpensesTotal: 0,
      aggregatedAccountsSummaryData: defaultAccountSummary,
      aggregatedFriendsSummaryData: defaultFriendSummary,
    },
    refetch,
  } = api.summary.getSummary.useQuery({});

  const accountColumns = createAccountColumns(refetch);
  const friendColumns = createFriendsColumns(refetch);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 rounded-md border p-2">
        <div className="grid grid-cols-2 gap-2">
          <p>Accounts Balance: {data.aggregatedAccountsSummaryData.finalBalance.toFixed(2)}</p>
          <p>Friend Balance: {data.aggregatedFriendsSummaryData.finalBalance.toFixed(2)}</p>
          <p>My Expenses: {data.myExpensesTotal.toFixed(2)}</p>
          <p>
            My Balance:{' '}
            {(
              data.aggregatedAccountsSummaryData.finalBalance -
              data.aggregatedFriendsSummaryData.finalBalance
            ).toFixed(2)}
          </p>
        </div>
      </div>
      <DataTableProvider columns={accountColumns} data={data.accountsSummaryData}>
        <DataTableHeader>
          <DataTableColumnSelect />
          <CreateAccountForm refresh={refetch} />
          <DataTableSearchBox name="Accounts" searchOn="accountName" />
        </DataTableHeader>
        <DataTableContent />
        <DataTableFooter />
      </DataTableProvider>

      <DataTableProvider columns={friendColumns} data={data.friendsSummaryData}>
        <DataTableHeader>
          <DataTableColumnSelect />
          <CreateFriendForm refresh={refetch} />
          <DataTableSearchBox name="Friends" searchOn="name" />
        </DataTableHeader>
        <DataTableContent />
        <DataTableFooter />
      </DataTableProvider>
    </div>
  );
}
