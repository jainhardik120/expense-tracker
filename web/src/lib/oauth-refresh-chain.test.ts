/* eslint-disable import/extensions, @typescript-eslint/no-floating-promises, no-magic-numbers */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chainIsAlive,
  type RotationRow,
  // @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
} from './oauth-refresh-chain.ts';

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
  assert.equal(chainIsAlive(first, [first, second], now), true);
});

test('it follows a chain of rotations the client kept missing', () => {
  const first = row('1', at(0), at(10));
  const second = row('2', at(10), at(20));
  const third = row('3', at(20), null);
  assert.equal(chainIsAlive(first, [first, second, third], now), true);
});

test('a token revoked on purpose has no successor and stays dead', () => {
  // Nothing was created at the moment it was revoked: a revocation, not a rotation.
  const revoked = row('1', at(0), at(10));
  const unrelated = row('2', at(25), null);
  assert.equal(chainIsAlive(revoked, [revoked, unrelated], now), false);
});

test('a chain whose end has itself been revoked is dead', () => {
  const first = row('1', at(0), at(10));
  const second = row('2', at(10), at(20));
  assert.equal(chainIsAlive(first, [first, second], now), false);
});

test('a chain whose end has expired is dead', () => {
  const first = row('1', at(0), at(10));
  const second: RotationRow = { ...row('2', at(10), null), expiresAt: at(15) };
  assert.equal(chainIsAlive(first, [first, second], now), false);
});

test('a live token is not something to recover', () => {
  const live = row('1', at(0), null);
  assert.equal(chainIsAlive(live, [live], now), false);
});
