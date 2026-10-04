export type RotationRow = {
  id: string;
  createdAt: Date | null;
  revoked: Date | null;
  expiresAt: Date | null;
};

const MAX_ROTATIONS_FOLLOWED = 20;

const successorOf = (row: RotationRow, family: RotationRow[]) => {
  const revokedAt = row.revoked?.getTime();
  if (revokedAt === undefined) {
    return undefined;
  }
  return family.find(
    (candidate) => candidate.id !== row.id && candidate.createdAt?.getTime() === revokedAt,
  );
};

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
