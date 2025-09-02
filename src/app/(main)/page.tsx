'use client';

import { useMemo } from 'react';

import DataTable from '@/components/ui/data-table';
import { api } from '@/server/react';

import { createAccountColumns } from './AccountColumns';
import { CreateAccountForm } from './AccountForms';
import { createFriendsColumns } from './FriendsColumns';
import { CreateFriendForm } from './FriendsForms';

export default function Page() {
  const { data: accountsSummaryData = [], refetch: refetchAccountData } =
    api.summary.getAccountBalanceSummary.useQuery();
  const { data: friendsSummaryData = [], refetch: refetchFriendsData } =
    api.summary.getFriendsBalanceSummary.useQuery();

  const accountColumns = createAccountColumns(refetchAccountData);
  const friendColumns = createFriendsColumns(refetchFriendsData);
  const balanceSummary = useMemo(() => {
    const totalAmount = accountsSummaryData.reduce((acc, cur) => {
      return acc + cur.finalAmount;
    }, 0);
    const friendTotalAmount = friendsSummaryData.reduce((acc, cur) => {
      return acc + cur.currentBalance;
    }, 0);
    const creditCards = accountsSummaryData.filter((acc) => acc.finalAmount < 0);
    const creditCardTotalAmount = creditCards.reduce((acc, cur) => {
      return acc + cur.finalAmount;
    }, 0);
    const bankAccountTotalAmount = accountsSummaryData.filter((acc) => acc.finalAmount > 0);
    const bankAccountTotalAmountSum = bankAccountTotalAmount.reduce((acc, cur) => {
      return acc + cur.finalAmount;
    }, 0);
    return {
      totalAmount,
      creditCardTotalAmount,
      bankAccountTotalAmountSum,
      friendTotalAmount,
      myBalance: totalAmount - friendTotalAmount,
    };
  }, [accountsSummaryData, friendsSummaryData]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 rounded-md border p-2">
        <div className="grid grid-cols-2 gap-2">
          <p>Bank Account Balance: {balanceSummary.bankAccountTotalAmountSum.toFixed(2)}</p>
          <p>Credit Card Balance: {balanceSummary.creditCardTotalAmount.toFixed(2)}</p>
          <p>My Balance: {balanceSummary.myBalance.toFixed(2)}</p>
          <p>Friend Balance: {balanceSummary.friendTotalAmount.toFixed(2)}</p>
          <p>Total Balance: {balanceSummary.totalAmount.toFixed(2)}</p>
        </div>
      </div>
      <DataTable
        CreateButton={<CreateAccountForm refresh={refetchAccountData} />}
        columns={accountColumns}
        data={accountsSummaryData}
        filterOn="accountName"
        name="Accounts"
      />
      <DataTable
        CreateButton={<CreateFriendForm refresh={refetchFriendsData} />}
        columns={friendColumns}
        data={friendsSummaryData}
        filterOn="name"
        name="Friends"
      />
    </div>
  );
}
