/* eslint-disable @typescript-eslint/require-await */
import { Suspense } from 'react';

import { type SearchParams } from 'nuqs';

import { api } from '@/server/server';
import { statementsSearchParamsCache } from '@/types/statements';

import { CreateSelfTransferStatementForm } from './SelfTransferStatementForms';
import { CreateStatementForm } from './StatementForms';
import StatementsTable from './StatementsTable';

export default async function Page(props: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const searchParams = await props.searchParams;
  const search = statementsSearchParamsCache.parse(searchParams);
  const promises = Promise.all([api.statements.getStatements(search)]);
  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <CreateSelfTransferStatementForm
          refresh={async () => {
            'use server';
          }}
        />
        <CreateStatementForm
          refresh={async () => {
            'use server';
          }}
        />
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <StatementsTable promises={promises} />
      </Suspense>
    </div>
  );
}
