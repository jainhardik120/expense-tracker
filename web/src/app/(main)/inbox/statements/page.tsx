import { api } from '@/server/server';

import { StatementImportsView } from './_components/statement-imports-view';

export default async function InboxStatementsPage() {
  const [imports, accounts, sources] = await Promise.all([
    api.statementImports.list(),
    api.accounts.getAccounts(),
    api.statementImports.listSources(),
  ]);
  return <StatementImportsView accounts={accounts} imports={imports} sources={sources} />;
}
