import { api } from '@/server/server';

import { InboxTabs } from './_components/inbox-tabs';

export default async function InboxLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const overview = await api.statementImports.getOverview();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Inbox</h2>
        <p className="text-muted-foreground text-sm">
          Everything that still needs to get into your ledger: bank statements, SMS alerts,
          forwarded emails and balances that do not match the bank.
        </p>
      </div>
      <InboxTabs overview={overview} />
      {children}
    </div>
  );
}
