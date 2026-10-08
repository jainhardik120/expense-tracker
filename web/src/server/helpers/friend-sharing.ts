import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';

import { user } from '@/db/auth-schema';
import {
  friendInvitations,
  friendsProfiles,
  sharedAnswers,
  splits,
  statements,
  visibleStatements,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { type InboxResolution, MS_PER_DAY, type SharedStatementUpdate } from '@/types';

export const needsAnAnswer = sql`((${statements.statementKind} = 'friend_transaction' AND ${statements.accountId} IS NOT NULL) OR (${statements.statementKind} = 'expense' AND ${statements.accountId} IS NULL))`;

const sameTags = (left: string[], right: string[]) => left.join('\u0000') === right.join('\u0000');

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

const countWaiting = async (db: Database, viewerUserId: string, originProfileId: string) => {
  const [row] = await db
    .select({ waiting: count() })
    .from(statements)
    .leftJoin(
      sharedAnswers,
      and(
        eq(sharedAnswers.statementId, statements.id),
        eq(sharedAnswers.viewerUserId, viewerUserId),
      ),
    )
    .where(
      and(
        eq(statements.friendId, originProfileId),
        needsAnAnswer,
        sql`${sharedAnswers.status} IS NULL`,
      ),
    );
  return row.waiting;
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
    if (invitation?.inviterLinkedUserId !== null) {
      throw new Error('This invitation is no longer open');
    }
    if (invitation.inviterUserId === me.id) {
      throw new Error('That is your own invitation');
    }
    const myProfileId = await pickOwnProfile(db, {
      userId: me.id,
      inviterUserId: invitation.inviterUserId,
      inviterName: invitation.inviterName,
      chosenId: chosenFriendId,
    });
    const linkedAt = new Date();
    await db
      .update(friendsProfiles)
      .set({ linkedUserId: me.id, linkedProfileId: myProfileId, linkedAt })
      .where(eq(friendsProfiles.id, invitation.friendId));
    await db
      .update(friendsProfiles)
      .set({
        linkedUserId: invitation.inviterUserId,
        linkedProfileId: invitation.friendId,
        linkedAt,
      })
      .where(eq(friendsProfiles.id, myProfileId));
    await db
      .update(friendInvitations)
      .set({ status: 'accepted', respondedAt: linkedAt })
      .where(eq(friendInvitations.id, invitation.id));
    const [shared] = await db
      .select({ total: count() })
      .from(visibleStatements)
      .where(
        and(
          eq(visibleStatements.userId, me.id),
          eq(visibleStatements.friendId, myProfileId),
          ne(visibleStatements.shareKind, 'own'),
        ),
      );
    return {
      friendId: myProfileId,
      sharedStatements: shared.total,
      toReview: await countWaiting(db, me.id, invitation.friendId),
    };
  },
);

const loadQuestions = (db: Database, viewerUserId: string, statementIds: string[]) =>
  db
    .select({
      id: statements.id,
      amount: statements.amount,
      category: statements.category,
      tags: statements.tags,
      status: sharedAnswers.status,
    })
    .from(statements)
    .innerJoin(friendsProfiles, eq(friendsProfiles.id, statements.friendId))
    .leftJoin(
      sharedAnswers,
      and(
        eq(sharedAnswers.statementId, statements.id),
        eq(sharedAnswers.viewerUserId, viewerUserId),
      ),
    )
    .where(
      and(
        inArray(statements.id, statementIds),
        eq(friendsProfiles.linkedUserId, viewerUserId),
        needsAnAnswer,
      ),
    )
    .for('update', { of: statements });

export const answerReviewEntries = instrumentedFunction(
  'answerReviewEntries',
  async (db: Database, viewerUserId: string, ids: string[], resolution: InboxResolution) => {
    const questions = await loadQuestions(db, viewerUserId, ids);
    if (questions.length !== new Set(ids).size) {
      throw new Error('Some of these are no longer waiting for an answer');
    }
    if (questions.some((question) => question.status !== null)) {
      throw new Error('Some of these have already been answered');
    }
    if (
      resolution.type === 'expense' &&
      questions.some((question) => Number(question.amount) >= 0)
    ) {
      throw new Error('Only money they paid out can be an expense they paid for you');
    }
    const answeredAt = new Date();
    const rows = questions.map((question) => {
      const category =
        resolution.type !== 'dismiss' &&
        resolution.category !== undefined &&
        resolution.category !== question.category
          ? resolution.category
          : null;
      const tags =
        resolution.type !== 'dismiss' &&
        resolution.tags !== undefined &&
        !sameTags(resolution.tags, question.tags)
          ? resolution.tags
          : null;
      return {
        viewerUserId,
        statementId: question.id,
        status: resolution.type === 'dismiss' ? ('dismissed' as const) : ('accepted' as const),
        accountId: resolution.type === 'account' ? resolution.accountId : null,
        asKind:
          resolution.type === 'expense' ? ('expense' as const) : ('friend_transaction' as const),
        category,
        tags,
        answeredAt,
      };
    });
    await db
      .insert(sharedAnswers)
      .values(rows)
      .onConflictDoUpdate({
        target: [sharedAnswers.statementId, sharedAnswers.viewerUserId],
        targetWhere: sql`${sharedAnswers.statementId} IS NOT NULL`,
        set: {
          status: sql`excluded.status`,
          accountId: sql`excluded.account_id`,
          asKind: sql`excluded.as_kind`,
          category: sql`coalesce(excluded.category, ${sharedAnswers.category})`,
          tags: sql`coalesce(excluded.tags, ${sharedAnswers.tags})`,
          answeredAt: sql`excluded.answered_at`,
        },
      });
    return { resolved: rows.length };
  },
);

export const reopenReviewEntries = instrumentedFunction(
  'reopenReviewEntries',
  async (db: Database, viewerUserId: string, ids: string[]) => {
    const reopened = await db
      .update(sharedAnswers)
      .set({ status: null, accountId: null, asKind: null, answeredAt: null })
      .where(
        and(
          eq(sharedAnswers.viewerUserId, viewerUserId),
          inArray(sharedAnswers.statementId, ids),
          sql`${sharedAnswers.status} IS NOT NULL`,
        ),
      )
      .returning({ id: sharedAnswers.id });
    return { reopened: reopened.length };
  },
);

const loadSharedSource = async (
  db: Database,
  viewerUserId: string,
  update: SharedStatementUpdate,
) => {
  if (update.shareKind === 'split') {
    return (
      await db
        .select({ category: statements.category, tags: statements.tags })
        .from(splits)
        .innerJoin(statements, eq(statements.id, splits.statementId))
        .innerJoin(friendsProfiles, eq(friendsProfiles.id, splits.friendId))
        .where(and(eq(splits.id, update.sourceId), eq(friendsProfiles.linkedUserId, viewerUserId)))
        .limit(1)
    ).at(0);
  }
  return (
    await db
      .select({
        category: statements.category,
        tags: statements.tags,
        statementKind: statements.statementKind,
        accountId: statements.accountId,
      })
      .from(statements)
      .innerJoin(friendsProfiles, eq(friendsProfiles.id, statements.friendId))
      .where(
        and(eq(statements.id, update.sourceId), eq(friendsProfiles.linkedUserId, viewerUserId)),
      )
      .limit(1)
  ).at(0);
};

export const updateSharedStatement = instrumentedFunction(
  'updateSharedStatement',
  async (db: Database, viewerUserId: string, update: SharedStatementUpdate) => {
    const source = await loadSharedSource(db, viewerUserId, update);
    if (source === undefined) {
      throw new Error('This statement is no longer shared with you');
    }
    const category = update.category === source.category ? null : update.category;
    const tags = sameTags(update.tags, source.tags) ? null : update.tags;
    if (update.shareKind === 'split') {
      await db
        .insert(sharedAnswers)
        .values({ viewerUserId, splitId: update.sourceId, category, tags })
        .onConflictDoUpdate({
          target: [sharedAnswers.splitId, sharedAnswers.viewerUserId],
          targetWhere: sql`${sharedAnswers.splitId} IS NOT NULL`,
          set: { category, tags },
        });
      return { id: update.sourceId };
    }
    if (update.shareKind === 'balance') {
      await db
        .insert(sharedAnswers)
        .values({ viewerUserId, statementId: update.sourceId, category, tags })
        .onConflictDoUpdate({
          target: [sharedAnswers.statementId, sharedAnswers.viewerUserId],
          targetWhere: sql`${sharedAnswers.statementId} IS NOT NULL`,
          set: { category, tags },
        });
      return { id: update.sourceId };
    }
    const answer = (
      await db
        .select({ id: sharedAnswers.id, asKind: sharedAnswers.asKind })
        .from(sharedAnswers)
        .where(
          and(
            eq(sharedAnswers.statementId, update.sourceId),
            eq(sharedAnswers.viewerUserId, viewerUserId),
            eq(sharedAnswers.status, 'accepted'),
          ),
        )
        .limit(1)
    ).at(0);
    if (answer === undefined) {
      throw new Error('This statement is no longer shared with you');
    }
    if (
      answer.asKind === 'expense' &&
      update.accountId !== undefined &&
      update.accountId !== null
    ) {
      throw new Error('An expense they paid cannot come from one of your accounts');
    }
    await db
      .update(sharedAnswers)
      .set({
        category,
        tags,
        ...(answer.asKind === 'friend_transaction' && update.accountId !== undefined
          ? { accountId: update.accountId }
          : {}),
      })
      .where(eq(sharedAnswers.id, answer.id));
    return { id: update.sourceId };
  },
);

const MATCH_WINDOW_DAYS = 3;
const MATCH_WINDOW_MS = MATCH_WINDOW_DAYS * MS_PER_DAY;
const MATCH_AMOUNT_TOLERANCE = 1;
const MATCH_RELATIVE_TOLERANCE = 0.005;

type MatchSide = {
  id: string;
  amount: string;
  category: string;
  tags: string[];
  statementKind: string;
  accountId: string | null;
  createdAt: Date;
  accountName: string | null;
  blocked: boolean;
};

const matchStatementFields = {
  id: statements.id,
  amount: statements.amount,
  category: statements.category,
  tags: statements.tags,
  statementKind: statements.statementKind,
  accountId: statements.accountId,
  createdAt: statements.createdAt,
  accountName: sql<
    string | null
  >`(SELECT account_name FROM bank_account WHERE id = ${statements.accountId})`,
  blocked: sql<boolean>`(
    ${statements.taxableAmount} IS NOT NULL
    OR ${statements.additionalAttributes} ?| ARRAY['emiId', 'recurringPaymentId', 'salaryPaymentId']
    OR EXISTS (SELECT 1 FROM splits WHERE splits.statement_id = ${statements.id})
  )`,
};

const friendStatement = sql`(${statements.statementKind} = 'friend_transaction' OR (${statements.statementKind} = 'expense' AND ${statements.accountId} IS NULL))`;

const sharesDirectly = (side: MatchSide) =>
  side.statementKind === 'friend_transaction' && side.accountId === null;

const answerFrom = (kept: MatchSide, removed: MatchSide) => {
  const category = removed.category === kept.category ? null : removed.category;
  const tags = sameTags(removed.tags, kept.tags) ? null : removed.tags;
  if (sharesDirectly(kept)) {
    if (!sharesDirectly(removed)) {
      return null;
    }
    return { status: null, accountId: null, asKind: null, category, tags };
  }
  if (removed.statementKind === 'expense') {
    if (kept.statementKind !== 'friend_transaction' || Number(kept.amount) >= 0) {
      return null;
    }
    return {
      status: 'accepted' as const,
      accountId: null,
      asKind: 'expense' as const,
      category,
      tags,
    };
  }
  return {
    status: 'accepted' as const,
    accountId: removed.accountId,
    asKind: 'friend_transaction' as const,
    category,
    tags,
  };
};

const isPair = (mine: MatchSide, theirs: MatchSide) => {
  const gap = Math.abs(Number(mine.amount) + Number(theirs.amount));
  const size = Math.max(Math.abs(Number(mine.amount)), Math.abs(Number(theirs.amount)));
  return (
    gap <= Math.max(MATCH_AMOUNT_TOLERANCE, size * MATCH_RELATIVE_TOLERANCE) &&
    Math.abs(mine.createdAt.getTime() - theirs.createdAt.getTime()) <= MATCH_WINDOW_MS
  );
};

export type StatementMatch = { mine: MatchSide; theirs: MatchSide; friendUserId: string };

export const findStatementMatches = instrumentedFunction(
  'findStatementMatches',
  async (db: Database, userId: string, onlyTheirIds?: string[]): Promise<StatementMatch[]> => {
    const links = await db
      .select({
        myProfileId: friendsProfiles.id,
        friendUserId: friendsProfiles.linkedUserId,
        theirProfileId: friendsProfiles.linkedProfileId,
      })
      .from(friendsProfiles)
      .where(
        and(
          eq(friendsProfiles.userId, userId),
          sql`${friendsProfiles.linkedUserId} IS NOT NULL`,
          sql`${friendsProfiles.linkedProfileId} IS NOT NULL`,
        ),
      );
    const matches: StatementMatch[] = [];
    for (const link of links) {
      if (link.friendUserId === null || link.theirProfileId === null) {
        continue;
      }
      const [mineRows, theirRows] = await Promise.all([
        db
          .select(matchStatementFields)
          .from(statements)
          .where(
            and(
              eq(statements.userId, userId),
              eq(statements.friendId, link.myProfileId),
              friendStatement,
            ),
          ),
        db
          .select(matchStatementFields)
          .from(statements)
          .leftJoin(
            sharedAnswers,
            and(
              eq(sharedAnswers.statementId, statements.id),
              eq(sharedAnswers.viewerUserId, userId),
            ),
          )
          .where(
            and(
              eq(statements.userId, link.friendUserId),
              eq(statements.friendId, link.theirProfileId),
              needsAnAnswer,
              sql`${sharedAnswers.status} IS NULL`,
            ),
          ),
      ]);
      const candidates = mineRows
        .flatMap((mine) =>
          theirRows
            .filter(
              (theirs) =>
                !theirs.blocked && isPair(mine, theirs) && answerFrom(mine, theirs) !== null,
            )
            .map((theirs) => ({
              mine,
              theirs,
              gap: Math.abs(Number(mine.amount) + Number(theirs.amount)),
              days: Math.abs(mine.createdAt.getTime() - theirs.createdAt.getTime()),
            })),
        )
        .toSorted((left, right) =>
          left.gap === right.gap ? left.days - right.days : left.gap - right.gap,
        );
      const usedMine = new Set<string>();
      const usedTheirs = new Set<string>();
      for (const candidate of candidates) {
        if (usedMine.has(candidate.mine.id) || usedTheirs.has(candidate.theirs.id)) {
          continue;
        }
        usedMine.add(candidate.mine.id);
        usedTheirs.add(candidate.theirs.id);
        if (onlyTheirIds === undefined || onlyTheirIds.includes(candidate.theirs.id)) {
          matches.push({
            mine: candidate.mine,
            theirs: candidate.theirs,
            friendUserId: link.friendUserId,
          });
        }
      }
    }
    return matches;
  },
);

export const mergeStatementMatches = instrumentedFunction(
  'mergeStatementMatches',
  async (db: Database, userId: string, pairs: { mine: string; theirs: string }[]) => {
    const theirIds = pairs.map((pair) => pair.theirs);
    await db
      .select({ id: statements.id })
      .from(statements)
      .where(inArray(statements.id, [...theirIds, ...pairs.map((pair) => pair.mine)]))
      .for('update');
    const matches = await findStatementMatches(db, userId, theirIds);
    const confirmed = pairs.map((pair) => {
      const match = matches.find(
        (candidate) => candidate.theirs.id === pair.theirs && candidate.mine.id === pair.mine,
      );
      if (match === undefined) {
        throw new Error('Some of these are no longer a match');
      }
      return match;
    });
    for (const match of confirmed) {
      const answer = answerFrom(match.mine, match.theirs);
      if (answer === null) {
        throw new Error('Some of these are no longer a match');
      }
      await db
        .insert(sharedAnswers)
        .values({
          viewerUserId: match.friendUserId,
          statementId: match.mine.id,
          ...answer,
          answeredAt: answer.status === null ? null : new Date(),
        })
        .onConflictDoUpdate({
          target: [sharedAnswers.statementId, sharedAnswers.viewerUserId],
          targetWhere: sql`${sharedAnswers.statementId} IS NOT NULL`,
          set: {
            status: sql`excluded.status`,
            accountId: sql`excluded.account_id`,
            asKind: sql`excluded.as_kind`,
            category: sql`excluded.category`,
            tags: sql`excluded.tags`,
            answeredAt: sql`excluded.answered_at`,
          },
        });
      await db
        .delete(statements)
        .where(and(eq(statements.id, match.theirs.id), eq(statements.userId, match.friendUserId)));
    }
    return { merged: confirmed.length };
  },
);
