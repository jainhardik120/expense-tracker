import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { user } from '@/db/auth-schema';
import {
  friendInvitations,
  friendStatementInbox,
  friendsProfiles,
  splits,
  statements,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { type InboxResolution, isMirroredStatement } from '@/types';

type FriendLink = {
  targetUserId: string;
  targetProfileId: string;
};

const getFriendLink = async (
  db: Database,
  friendId: string,
  ownerUserId: string,
): Promise<FriendLink | null> => {
  const profile = (
    await db
      .select({
        linkedUserId: friendsProfiles.linkedUserId,
        linkedProfileId: friendsProfiles.linkedProfileId,
      })
      .from(friendsProfiles)
      .where(and(eq(friendsProfiles.id, friendId), eq(friendsProfiles.userId, ownerUserId)))
      .limit(1)
  ).at(0);
  if (profile?.linkedUserId == null || profile.linkedProfileId === null) {
    return null;
  }
  return { targetUserId: profile.linkedUserId, targetProfileId: profile.linkedProfileId };
};

const keepOverriddenCategory = {
  category: sql`CASE WHEN ${statements.categoryOverridden} THEN ${statements.category} ELSE excluded.category END`,
  tags: sql`CASE WHEN ${statements.categoryOverridden} THEN ${statements.tags} ELSE excluded.tags END`,
};

export const syncSplitMirrors = instrumentedFunction(
  'syncSplitMirrors',
  async (db: Database, splitIds: string[]) => {
    if (splitIds.length === 0) {
      return;
    }
    const sources = await db
      .select({
        splitId: splits.id,
        splitAmount: splits.amount,
        targetUserId: friendsProfiles.linkedUserId,
        targetProfileId: friendsProfiles.linkedProfileId,
        occurredAt: statements.createdAt,
        category: statements.category,
        tags: statements.tags,
        statementIsCopy: sql<boolean>`${statements.mirrorOfSplitId} IS NOT NULL OR ${statements.mirrorOfStatementId} IS NOT NULL`,
      })
      .from(splits)
      .innerJoin(statements, eq(statements.id, splits.statementId))
      .innerJoin(
        friendsProfiles,
        and(eq(friendsProfiles.id, splits.friendId), eq(friendsProfiles.userId, splits.userId)),
      )
      .where(inArray(splits.id, splitIds));
    const linked = sources.filter(
      (row): row is typeof row & { targetUserId: string; targetProfileId: string } =>
        !row.statementIsCopy && row.targetUserId !== null && row.targetProfileId !== null,
    );
    const unlinked = sources
      .filter((row) => row.statementIsCopy || row.targetUserId === null)
      .map((row) => row.splitId);
    if (unlinked.length > 0) {
      await db.delete(statements).where(inArray(statements.mirrorOfSplitId, unlinked));
    }
    if (linked.length === 0) {
      return;
    }
    await db.delete(statements).where(
      and(
        inArray(
          statements.mirrorOfSplitId,
          linked.map((row) => row.splitId),
        ),
        sql`(${statements.mirrorOfSplitId}, ${statements.userId}) NOT IN (${sql.join(
          linked.map((row) => sql`(${row.splitId}::uuid, ${row.targetUserId})`),
          sql`, `,
        )})`,
      ),
    );
    await db
      .insert(statements)
      .values(
        linked.map((row) => ({
          userId: row.targetUserId,
          accountId: null,
          friendId: row.targetProfileId,
          statementKind: 'expense' as const,
          amount: row.splitAmount,
          category: row.category,
          tags: row.tags,
          createdAt: row.occurredAt,
          mirrorOfSplitId: row.splitId,
        })),
      )
      .onConflictDoUpdate({
        target: statements.mirrorOfSplitId,
        targetWhere: isNotNull(statements.mirrorOfSplitId),
        set: {
          userId: sql`excluded.user_id`,
          amount: sql`excluded.amount`,
          createdAt: sql`excluded.created_at`,
          friendId: sql`excluded.friend_id`,
          ...keepOverriddenCategory,
        },
      });
  },
);

const syncSplitMirrorsForStatements = instrumentedFunction(
  'syncSplitMirrorsForStatements',
  async (db: Database, statementIds: string[]) => {
    if (statementIds.length === 0) {
      return;
    }
    const rows = await db
      .select({ id: splits.id })
      .from(splits)
      .where(inArray(splits.statementId, statementIds));
    await syncSplitMirrors(
      db,
      rows.map((row) => row.id),
    );
  },
);

const resolvedAmount = (statementKind: string, originAmount: string) =>
  statementKind === 'expense'
    ? Math.abs(Number(originAmount)).toString()
    : (-Number(originAmount)).toString();

const syncFriendTransactionInbox = async (
  db: Database,
  statementId: string,
  link: FriendLink,
  source: {
    ownerUserId: string;
    amount: string;
    category: string;
    tags: string[];
    occurredAt: Date;
  },
) => {
  const entry = (
    await db
      .insert(friendStatementInbox)
      .values({
        originStatementId: statementId,
        originUserId: source.ownerUserId,
        userId: link.targetUserId,
        friendId: link.targetProfileId,
        amount: source.amount,
        category: source.category,
        tags: source.tags,
        occurredAt: source.occurredAt,
      })
      .onConflictDoUpdate({
        target: [friendStatementInbox.originStatementId, friendStatementInbox.userId],
        set: {
          amount: sql`excluded.amount`,
          occurredAt: sql`excluded.occurred_at`,
          friendId: sql`excluded.friend_id`,
          category: sql`excluded.category`,
          tags: sql`excluded.tags`,
        },
      })
      .returning({ resolvedStatementId: friendStatementInbox.resolvedStatementId })
  ).at(0);
  const resolvedStatementId = entry?.resolvedStatementId ?? null;
  if (resolvedStatementId === null) {
    return;
  }
  const resolved = (
    await db
      .select({ statementKind: statements.statementKind })
      .from(statements)
      .where(eq(statements.id, resolvedStatementId))
      .limit(1)
  ).at(0);
  if (resolved === undefined) {
    return;
  }
  await db
    .update(statements)
    .set({
      amount: resolvedAmount(resolved.statementKind, source.amount),
      createdAt: source.occurredAt,
    })
    .where(eq(statements.id, resolvedStatementId));
};

export const reconcileStatement = instrumentedFunction(
  'reconcileStatement',
  async (db: Database, statementId: string) => {
    const source = (
      await db
        .select({
          ownerUserId: statements.userId,
          friendId: statements.friendId,
          statementKind: statements.statementKind,
          amount: statements.amount,
          category: statements.category,
          tags: statements.tags,
          occurredAt: statements.createdAt,
          mirrorOfSplitId: statements.mirrorOfSplitId,
          mirrorOfStatementId: statements.mirrorOfStatementId,
        })
        .from(statements)
        .where(eq(statements.id, statementId))
        .limit(1)
    ).at(0);
    if (source === undefined || isMirroredStatement(source)) {
      return;
    }
    const link =
      source.statementKind === 'friend_transaction' && source.friendId !== null
        ? await getFriendLink(db, source.friendId, source.ownerUserId)
        : null;
    await db
      .delete(friendStatementInbox)
      .where(
        and(
          eq(friendStatementInbox.originStatementId, statementId),
          isNull(friendStatementInbox.resolvedStatementId),
          link === null ? undefined : sql`${friendStatementInbox.userId} <> ${link.targetUserId}`,
        ),
      );
    if (link !== null) {
      await syncFriendTransactionInbox(db, statementId, link, source);
    }
    await syncSplitMirrorsForStatements(db, [statementId]);
  },
);

const projectOneDirection = async (db: Database, friendId: string, ownerUserId: string) => {
  const link = await getFriendLink(db, friendId, ownerUserId);
  if (link === null) {
    return { splitsMirrored: 0, transactionsQueued: 0 };
  }
  const { targetUserId, targetProfileId } = link;
  const mirrored = await db.execute(sql`
    INSERT INTO statements
      (user_id, account_id, friend_id, "statementKind", amount, category, tags, created_at,
       mirror_of_split_id)
    SELECT ${targetUserId}, NULL, ${targetProfileId}::uuid, 'expense', sp.amount, st.category,
           st.tags, st.created_at, sp.id
    FROM splits sp
    JOIN statements st ON st.id = sp.statement_id
    WHERE sp.user_id = ${ownerUserId}
      AND sp.friend_id = ${friendId}::uuid
      AND st.mirror_of_split_id IS NULL
      AND st.mirror_of_statement_id IS NULL
    ON CONFLICT (mirror_of_split_id) WHERE mirror_of_split_id IS NOT NULL
    DO UPDATE SET
      user_id = excluded.user_id,
      amount = excluded.amount,
      created_at = excluded.created_at,
      friend_id = excluded.friend_id,
      category = CASE WHEN statements.category_overridden AND statements.user_id = excluded.user_id
                      THEN statements.category ELSE excluded.category END,
      tags = CASE WHEN statements.category_overridden AND statements.user_id = excluded.user_id
                  THEN statements.tags ELSE excluded.tags END
  `);
  const queued = await db.execute(sql`
    INSERT INTO friend_statement_inbox
      (origin_statement_id, origin_user_id, user_id, friend_id, amount, category, tags,
       occurred_at, created_at)
    SELECT st.id, ${ownerUserId}, ${targetUserId}, ${targetProfileId}::uuid, st.amount,
           st.category, st.tags, st.created_at, now()
    FROM statements st
    WHERE st.user_id = ${ownerUserId}
      AND st.friend_id = ${friendId}::uuid
      AND st."statementKind" = 'friend_transaction'
      AND st.mirror_of_split_id IS NULL
      AND st.mirror_of_statement_id IS NULL
    ON CONFLICT (origin_statement_id, user_id)
    DO UPDATE SET
      amount = excluded.amount,
      occurred_at = excluded.occurred_at,
      friend_id = excluded.friend_id
  `);
  return { splitsMirrored: mirrored.rowCount ?? 0, transactionsQueued: queued.rowCount ?? 0 };
};

const linkFriendProfiles = async (
  db: Database,
  left: { profileId: string; userId: string },
  right: { profileId: string; userId: string },
) => {
  const linkedAt = new Date();
  await db
    .update(friendsProfiles)
    .set({ linkedUserId: right.userId, linkedProfileId: right.profileId, linkedAt })
    .where(and(eq(friendsProfiles.id, left.profileId), eq(friendsProfiles.userId, left.userId)));
  await db
    .update(friendsProfiles)
    .set({ linkedUserId: left.userId, linkedProfileId: left.profileId, linkedAt })
    .where(and(eq(friendsProfiles.id, right.profileId), eq(friendsProfiles.userId, right.userId)));
  const leftProjected = await projectOneDirection(db, left.profileId, left.userId);
  const rightProjected = await projectOneDirection(db, right.profileId, right.userId);
  return { left: leftProjected, right: rightProjected };
};

const pickOwnProfile = async (
  db: Database,
  options: { userId: string; inviterUserId: string; inviterName: string; chosenId: string | null },
) => {
  const profiles = await db
    .select({ id: friendsProfiles.id, linkedUserId: friendsProfiles.linkedUserId })
    .from(friendsProfiles)
    .where(eq(friendsProfiles.userId, options.userId));
  const alreadyLinked = profiles.find((row) => row.linkedUserId === options.inviterUserId);
  if (alreadyLinked !== undefined) {
    if (options.chosenId !== null && options.chosenId !== alreadyLinked.id) {
      throw new Error('You are already connected to this person through another friend');
    }
    return alreadyLinked.id;
  }
  if (options.chosenId === null) {
    const created = await db
      .insert(friendsProfiles)
      .values({ userId: options.userId, name: options.inviterName })
      .returning({ id: friendsProfiles.id });
    return created[0].id;
  }
  const chosen = profiles.find((row) => row.id === options.chosenId);
  if (chosen === undefined) {
    throw new Error('Friend not found');
  }
  if (chosen.linkedUserId !== null) {
    throw new Error('That friend is already connected to someone else');
  }
  return chosen.id;
};

export const acceptFriendInvitation = instrumentedFunction(
  'acceptFriendInvitation',
  async (
    db: Database,
    me: { id: string; email: string },
    invitationId: string,
    chosenFriendId: string | null,
  ) => {
    const invitation = (
      await db
        .select({
          id: friendInvitations.id,
          inviterUserId: friendInvitations.inviterUserId,
          friendId: friendInvitations.friendId,
          email: friendInvitations.email,
          inviterName: user.name,
          inviterLinkedUserId: friendsProfiles.linkedUserId,
        })
        .from(friendInvitations)
        .innerJoin(user, eq(user.id, friendInvitations.inviterUserId))
        .innerJoin(friendsProfiles, eq(friendsProfiles.id, friendInvitations.friendId))
        .where(
          and(
            eq(friendInvitations.id, invitationId),
            eq(friendInvitations.email, me.email.toLowerCase()),
            eq(friendInvitations.status, 'pending'),
          ),
        )
        .limit(1)
        .for('update', { of: friendInvitations })
    ).at(0);
    if (invitation === undefined) {
      throw new Error('This invitation is no longer open');
    }
    if (invitation.inviterUserId === me.id) {
      throw new Error('That is your own invitation');
    }
    if (invitation.inviterLinkedUserId !== null && invitation.inviterLinkedUserId !== me.id) {
      throw new Error('This invitation is no longer open');
    }
    const myProfileId = await pickOwnProfile(db, {
      userId: me.id,
      inviterUserId: invitation.inviterUserId,
      inviterName: invitation.inviterName,
      chosenId: chosenFriendId,
    });
    const projected = await linkFriendProfiles(
      db,
      { profileId: invitation.friendId, userId: invitation.inviterUserId },
      { profileId: myProfileId, userId: me.id },
    );
    await db
      .update(friendInvitations)
      .set({ status: 'accepted', respondedAt: new Date() })
      .where(eq(friendInvitations.id, invitation.id));
    return {
      friendId: myProfileId,
      splitsReceived: projected.left.splitsMirrored,
      transactionsToReview: projected.left.transactionsQueued,
      splitsSent: projected.right.splitsMirrored,
      transactionsSent: projected.right.transactionsQueued,
    };
  },
);

export const resolveInboxEntry = instrumentedFunction(
  'resolveInboxEntry',
  async (db: Database, userId: string, entryId: string, resolution: InboxResolution) => {
    const entry = (
      await db
        .select()
        .from(friendStatementInbox)
        .where(
          and(
            eq(friendStatementInbox.id, entryId),
            eq(friendStatementInbox.userId, userId),
            eq(friendStatementInbox.status, 'pending'),
          ),
        )
        .limit(1)
        .for('update')
    ).at(0);
    if (entry === undefined) {
      throw new Error('This entry is no longer waiting for an answer');
    }
    if (resolution.type === 'dismiss') {
      await db
        .update(friendStatementInbox)
        .set({ status: 'dismissed', resolvedAt: new Date() })
        .where(eq(friendStatementInbox.id, entry.id));
      return { statementId: null };
    }
    if (resolution.type === 'expense' && Number(entry.amount) >= 0) {
      throw new Error('Only money they paid out can be an expense they paid for you');
    }
    const statementKind = resolution.type === 'expense' ? 'expense' : 'friend_transaction';
    const category = resolution.category ?? entry.category;
    const tags = resolution.tags ?? entry.tags;
    const created = await db
      .insert(statements)
      .values({
        userId,
        statementKind,
        accountId: resolution.type === 'account' ? resolution.accountId : null,
        friendId: entry.friendId,
        amount: resolvedAmount(statementKind, entry.amount),
        category,
        tags,
        createdAt: entry.occurredAt,
        mirrorOfStatementId: entry.originStatementId,
        categoryOverridden:
          category !== entry.category || tags.join('\u0000') !== entry.tags.join('\u0000'),
      })
      .returning({ id: statements.id });
    const statementId = created[0].id;
    await db
      .update(friendStatementInbox)
      .set({ status: 'accepted', resolvedStatementId: statementId, resolvedAt: new Date() })
      .where(eq(friendStatementInbox.id, entry.id));
    return { statementId };
  },
);
