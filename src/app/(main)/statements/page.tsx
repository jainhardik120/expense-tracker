import { createLoader, type SearchParams } from 'nuqs/server';

import DateFilter from '@/components/date-filter';
import { api } from '@/server/server';
import { statementParser } from '@/types';

import { CreateSelfTransferStatementForm } from './SelfTransferStatementForms';
import { CreateStatementForm } from './StatementForms';
import Table from './table';

const loader = createLoader(statementParser);

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const pageParams = await loader(searchParams);
  const data = await api.statements.getStatements(pageParams);
  const friends = await api.friends.getFriends();
  const accounts = await api.accounts.getAccounts();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <DateFilter />
        <CreateSelfTransferStatementForm accountsData={accounts} />
        <CreateStatementForm accountsData={accounts} friendsData={friends} />
      </div>
      <Table accountsData={accounts} data={data} friendsData={friends} />
    </div>
  );
}
