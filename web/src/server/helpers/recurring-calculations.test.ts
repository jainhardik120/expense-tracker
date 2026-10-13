import { describe, expect, it } from 'vitest';

import { type RecurringPayment } from '@/types';

import { assertLinkableDate } from './recurring-calculations';

const rent: RecurringPayment = {
  id: 'rent',
  userId: 'user',
  name: 'House Rent',
  amount: '26000',
  frequency: 'monthly',
  frequencyMultiplier: '1',
  startDate: new Date('2025-10-25T00:00:00Z'),
  endDate: new Date('2026-12-25T00:00:00Z'),
  category: 'House',
  createdAt: new Date('2025-10-01T00:00:00Z'),
};

const paid = (iso: string) => ({ id: iso, amount: '26000', createdAt: new Date(iso) });

describe('assertLinkableDate', () => {
  it('accepts a payment a few days off its due date', () => {
    expect(() => {
      assertLinkableDate(rent, new Date('2026-03-27T10:00:00Z'), [], 'UTC');
    }).not.toThrow();
  });

  it('rejects a payment before the schedule starts', () => {
    expect(() => {
      assertLinkableDate(rent, new Date('2025-09-25T10:00:00Z'), [], 'UTC');
    }).toThrow('no payment due within 7 days');
  });

  it('rejects a payment after the schedule ends', () => {
    expect(() => {
      assertLinkableDate(rent, new Date('2027-01-25T10:00:00Z'), [], 'UTC');
    }).toThrow('no payment due within 7 days');
  });

  it('rejects a payment that falls between two due dates', () => {
    expect(() => {
      assertLinkableDate(rent, new Date('2026-03-10T10:00:00Z'), [], 'UTC');
    }).toThrow('no payment due within 7 days');
  });

  it('rejects a second payment for a due date that is already paid', () => {
    expect(() => {
      assertLinkableDate(
        rent,
        new Date('2026-03-28T10:00:00Z'),
        [paid('2026-03-25T08:00:00Z')],
        'UTC',
      );
    }).toThrow('due 25 Mar 2026 is already paid');
  });
});
