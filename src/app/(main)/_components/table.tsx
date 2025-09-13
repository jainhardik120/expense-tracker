'use client';

import { useRouter } from 'next/navigation';

import DataTable from '@/components/ui/data-table';
import { type RouterOutput } from '@/server/routers';

import { createAccountColumns } from './AccountColumns';
import { CreateAccountForm } from './AccountForms';
import { createFriendsColumns } from './FriendsColumns';
import { CreateFriendForm } from './FriendsForms';

type SummaryData = RouterOutput['summary']['getSummary'];

const Table = ({ data }: { data: SummaryData }) => {
  const router = useRouter();
  const refetch = () => {
    router.refresh();
  };
  const accountColumns = createAccountColumns(refetch);
  const friendColumns = createFriendsColumns(refetch);

  return (
    <>
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
    </>
  );
};

export default Table;
