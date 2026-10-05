import { api } from '@/server/server';

import EmailForwardingView from './_components/email-forwarding-view';

export default async function EmailForwardingPage() {
  const [inbox, emails, accounts] = await Promise.all([
    api.emailForwarding.getInbox(),
    api.emailForwarding.listEmails(),
    api.accounts.getAccounts(),
  ]);
  return <EmailForwardingView accounts={accounts} emails={emails} inbox={inbox} />;
}
