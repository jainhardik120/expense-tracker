/**
 * The shape of the provider's `oauth_refresh_token` rows that matters when
 * following a rotation, kept apart from the database so it can be reasoned
 * about — and tested — on its own.
 */
export type RotationRow = {
  id: string;
  createdAt: Date | null;
  revoked: Date | null;
  expiresAt: Date | null;
};

/** A chain longer than this is a loop, not a client that keeps losing responses. */
const MAX_ROTATIONS_FOLLOWED = 20;

/**
 * Rotation marks the old row revoked at the same instant it creates the new
 * one, both from a single `iat`. That shared timestamp links a token to its
 * successor, and it is also what tells a rotation apart from a deliberate
 * revoke: a token killed through the revocation endpoint has no row created
 * alongside it.
 */
const successorOf = (row: RotationRow, family: RotationRow[]) => {
  const revokedAt = row.revoked?.getTime();
  if (revokedAt === undefined) {
    return undefined;
  }
  return family.find(
    (candidate) => candidate.id !== row.id && candidate.createdAt?.getTime() === revokedAt,
  );
};

/** Whether the rotation chain this token started still ends somewhere usable. */
export const chainIsAlive = (row: RotationRow, family: RotationRow[], now: Date) => {
  let current = row;
  for (let hop = 0; hop < MAX_ROTATIONS_FOLLOWED; hop++) {
    const successor = successorOf(current, family);
    if (successor === undefined) {
      return false;
    }
    if (successor.revoked === null) {
      return successor.expiresAt !== null && successor.expiresAt > now;
    }
    current = successor;
  }
  return false;
};
