/* eslint-disable import/extensions, @typescript-eslint/no-floating-promises */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isOwnAccountTransfer,
  resolveSmsType,
  // @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
} from './sms-notification-rules.ts';

const HOLDER = 'Hardik Jain';
const UPPERCASED = 'HARDIK JAIN';

describe('isOwnAccountTransfer', () => {

  it('matches the account holder however the bank cased or padded it', () => {
    assert.equal(isOwnAccountTransfer(UPPERCASED, HOLDER), true);
    assert.equal(isOwnAccountTransfer('Hardik  Jain', HOLDER), true);
    assert.equal(isOwnAccountTransfer('hardik jain', HOLDER), true);
  });

  it('matches when the bank reverses the name', () => {
    assert.equal(isOwnAccountTransfer('JAIN HARDIK', HOLDER), true);
  });

  it('does not match a relative who shares the surname', () => {
    assert.equal(isOwnAccountTransfer('RUCHITA JAIN', HOLDER), false);
    assert.equal(isOwnAccountTransfer('VASHNI AGRAHARI', HOLDER), false);
  });

  it('does not match a name the holder name is merely part of', () => {
    assert.equal(isOwnAccountTransfer('HARDIK JAIN WO LAT', HOLDER), false);
    assert.equal(isOwnAccountTransfer('JAIN', HOLDER), false);
  });

  it('does not match a UPI handle that happens to contain the name', () => {
    assert.equal(isOwnAccountTransfer('jainhardik120 4', HOLDER), false);
  });

  it('refuses to identify anyone by a single word', () => {
    assert.equal(isOwnAccountTransfer('Hardik', 'Hardik'), false);
  });

  it('takes a missing merchant or holder as no match', () => {
    assert.equal(isOwnAccountTransfer(null, HOLDER), false);
    assert.equal(isOwnAccountTransfer(UPPERCASED, null), false);
    assert.equal(isOwnAccountTransfer(UPPERCASED, ''), false);
  });
});

describe('resolveSmsType', () => {

  it('calls both legs of a self transfer a transfer', () => {
    assert.equal(resolveSmsType('expense', UPPERCASED, HOLDER), 'transfer');
    assert.equal(resolveSmsType('income', UPPERCASED, HOLDER), 'transfer');
  });

  it('leaves an ordinary payment alone', () => {
    assert.equal(resolveSmsType('expense', 'LEMON CUBE', HOLDER), 'expense');
    assert.equal(resolveSmsType('credit', 'SWIGGY', HOLDER), 'credit');
    assert.equal(resolveSmsType('income', 'VASHNI AGRAHARI', HOLDER), 'income');
  });

  it('leaves an investment as an investment', () => {
    // Money into one's own broker is still an investment, not a transfer, and
    // the broker's name is what identifies it.
    assert.equal(resolveSmsType('investment', UPPERCASED, HOLDER), 'investment');
  });
});
