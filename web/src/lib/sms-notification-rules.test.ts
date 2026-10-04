import { expect, describe, it } from 'vitest';

import { isOwnAccountTransfer, resolveSmsType } from './sms-notification-rules';

const HOLDER = 'Hardik Jain';
const UPPERCASED = 'HARDIK JAIN';

describe('isOwnAccountTransfer', () => {
  it('matches the account holder however the bank cased or padded it', () => {
    expect(isOwnAccountTransfer(UPPERCASED, HOLDER)).toBe(true);
    expect(isOwnAccountTransfer('Hardik  Jain', HOLDER)).toBe(true);
    expect(isOwnAccountTransfer('hardik jain', HOLDER)).toBe(true);
  });

  it('matches when the bank reverses the name', () => {
    expect(isOwnAccountTransfer('JAIN HARDIK', HOLDER)).toBe(true);
  });

  it('does not match a relative who shares the surname', () => {
    expect(isOwnAccountTransfer('RUCHITA JAIN', HOLDER)).toBe(false);
    expect(isOwnAccountTransfer('VASHNI AGRAHARI', HOLDER)).toBe(false);
  });

  it('does not match a name the holder name is merely part of', () => {
    expect(isOwnAccountTransfer('HARDIK JAIN WO LAT', HOLDER)).toBe(false);
    expect(isOwnAccountTransfer('JAIN', HOLDER)).toBe(false);
  });

  it('does not match a UPI handle that happens to contain the name', () => {
    expect(isOwnAccountTransfer('jainhardik120 4', HOLDER)).toBe(false);
  });

  it('refuses to identify anyone by a single word', () => {
    expect(isOwnAccountTransfer('Hardik', 'Hardik')).toBe(false);
  });

  it('takes a missing merchant or holder as no match', () => {
    expect(isOwnAccountTransfer(null, HOLDER)).toBe(false);
    expect(isOwnAccountTransfer(UPPERCASED, null)).toBe(false);
    expect(isOwnAccountTransfer(UPPERCASED, '')).toBe(false);
  });
});

describe('resolveSmsType', () => {
  it('calls both legs of a self transfer a transfer', () => {
    expect(resolveSmsType('expense', UPPERCASED, HOLDER)).toBe('transfer');
    expect(resolveSmsType('income', UPPERCASED, HOLDER)).toBe('transfer');
  });

  it('leaves an ordinary payment alone', () => {
    expect(resolveSmsType('expense', 'LEMON CUBE', HOLDER)).toBe('expense');
    expect(resolveSmsType('credit', 'SWIGGY', HOLDER)).toBe('credit');
    expect(resolveSmsType('income', 'VASHNI AGRAHARI', HOLDER)).toBe('income');
  });

  it('leaves an investment as an investment', () => {
    expect(resolveSmsType('investment', UPPERCASED, HOLDER)).toBe('investment');
  });
});
