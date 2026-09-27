import { expect, test } from 'vitest';

import { chainIsAlive, type RotationRow } from './oauth-refresh-chain';

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 12, minute));
const now = at(30);
const later = new Date(Date.UTC(2026, 1, 1));

/** A token rotated away at `revokedAt`, or the live one when that is null. */
const row = (id: string, createdAt: Date, revokedAt: Date | null): RotationRow => ({
  id,
  createdAt,
  revoked: revokedAt,
  expiresAt: later,
});

test('a token rotated away reaches the live token that replaced it', () => {
  const first = row('1', at(0), at(10));
  const second = row('2', at(10), null);
  expect(chainIsAlive(first, [first, second], now)).toBe(true);
});

test('it follows a chain of rotations the client kept missing', () => {
  const first = row('1', at(0), at(10));
  const second = row('2', at(10), at(20));
  const third = row('3', at(20), null);
  expect(chainIsAlive(first, [first, second, third], now)).toBe(true);
});

test('a token revoked on purpose has no successor and stays dead', () => {
  // Nothing was created at the moment it was revoked: a revocation, not a rotation.
  const revoked = row('1', at(0), at(10));
  const unrelated = row('2', at(25), null);
  expect(chainIsAlive(revoked, [revoked, unrelated], now)).toBe(false);
});

test('a chain whose end has itself been revoked is dead', () => {
  const first = row('1', at(0), at(10));
  const second = row('2', at(10), at(20));
  expect(chainIsAlive(first, [first, second], now)).toBe(false);
});

test('a chain whose end has expired is dead', () => {
  const first = row('1', at(0), at(10));
  const second: RotationRow = { ...row('2', at(10), null), expiresAt: at(15) };
  expect(chainIsAlive(first, [first, second], now)).toBe(false);
});

test('a live token is not something to recover', () => {
  const live = row('1', at(0), null);
  expect(chainIsAlive(live, [live], now)).toBe(false);
});
