import { api } from '@/server/server';

import EmailForwardingView from './_components/email-forwarding-view';

export default async function EmailForwardingPage() {
  const [inbox, emails] = await Promise.all([
    api.emailForwarding.getInbox(),
    api.emailForwarding.listEmails(),
  ]);
  return <EmailForwardingView emails={emails} inbox={inbox} />;
}
