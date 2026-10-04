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
