'use client';

import DataTable from '@/components/ui/data-table';
import { api } from '@/server/react';
import { defaultAccountSummary, defaultFriendSummary } from '@/types';

import { createAccountColumns } from './AccountColumns';
import { CreateAccountForm } from './AccountForms';
import { createFriendsColumns } from './FriendsColumns';
import { CreateFriendForm } from './FriendsForms';

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
          <p>Accounts Balance: {data.aggregatedAccountsSummaryData.totalTransfers.toFixed(2)}</p>
          <p>Friend Balance: {data.aggregatedFriendsSummaryData.totalTransfers.toFixed(2)}</p>
          <p>My Expenses: {data.myExpensesTotal.toFixed(2)}</p>
          <p>
            My Balance:{' '}
            {(
              data.aggregatedAccountsSummaryData.totalTransfers -
              data.aggregatedFriendsSummaryData.totalTransfers
            ).toFixed(2)}
          </p>
        </div>
      </div>
      <DataTable
        CreateButton={<CreateAccountForm refresh={refetch} />}
        columns={accountColumns}
        data={data.accountsSummaryData}
        filterOn="accountName"
        name="Accounts"
      />
      <DataTable
        CreateButton={<CreateFriendForm refresh={refetch} />}
        columns={friendColumns}
        data={data.friendsSummaryData}
        filterOn="name"
        name="Friends"
      />
    </div>
  );
}
