import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { and, desc, eq, gt } from 'drizzle-orm';

import { session as sessionTable } from '@/db/auth-schema';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

import Passkeys from './passkeys';
import Sessions from './sessions';
import TwoFactor from './two-factor';

export default async function SecurityPage() {
  const session = await auth.api
    .getSession({
      headers: await headers(),
    })
    .catch(() => {
      redirect('/auth/login');
    });
  // Not `auth.api.listSessions`: that runs an unbounded findMany, which the
  // adapter caps at 100 rows in insertion order, and only then drops the
  // expired ones. Once a user has 100 expired sessions behind them the cap is
  // filled entirely with dead rows and the list comes back empty.
  const activeSessions =
    session === null
      ? []
      : await db
          .select()
          .from(sessionTable)
          .where(
            and(eq(sessionTable.userId, session.user.id), gt(sessionTable.expiresAt, new Date())),
          )
          .orderBy(desc(sessionTable.updatedAt));
  return (
    <>
      <Passkeys />
      <TwoFactor session={session} />
      <Sessions activeSessions={activeSessions} session={session} />
    </>
  );
}
