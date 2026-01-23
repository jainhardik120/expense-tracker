import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

import Passkeys from './passkeys';
import Sessions from './sessions';
import TwoFactor from './two-factor';

export default async function SecurityPage() {
  const [session, activeSessions] = await Promise.all([
    auth.api.getSession({
      headers: await headers(),
    }),
    auth.api.listSessions({
      headers: await headers(),
    }),
  ]).catch(() => {
    redirect('/auth/login');
  });
  return (
    <>
      <h1>Security</h1>
      <Passkeys />
      <TwoFactor session={session} />
      <Sessions activeSessions={activeSessions} session={session} />
    </>
  );
}
