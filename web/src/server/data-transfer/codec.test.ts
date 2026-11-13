import { describe, expect, it } from 'vitest';

import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  encodeTables,
  microsToTimestamp,
  parseExport,
  planImport,
  serializeExport,
  type ExportFile,
} from './codec';
import { findTransferTable } from './tables';

const FRIEND = '11111111-1111-4111-8111-111111111111';
const STATEMENT = '22222222-2222-4222-8222-222222222222';
const COMPONENT = '33333333-3333-4333-8333-333333333333';
const YEAR = '44444444-4444-4444-8444-444444444444';
const LINE = '55555555-5555-4555-8555-555555555555';
const EXISTING_COMPONENT = '66666666-6666-4666-8666-666666666666';
const CREATED = 1_794_580_818_123_456;

const rowFor = (table: string, values: Record<string, unknown>) =>
  (findTransferTable(table)?.columns ?? []).map((column) => values[column.name] ?? null);

const raw = {
  friends_profiles: [
    rowFor('friends_profiles', { id: FRIEND, name: 'Mummy', created_at: CREATED }),
  ],
  statements: [
    rowFor('statements', {
      id: STATEMENT,
      friend_id: FRIEND,
      amount: '120.50',
      category: 'Food',
      tags: ['Lunch'],
      statementKind: 'friend_transaction',
      created_at: CREATED,
      additional_attributes: { recurringPaymentId: 'not-an-id', note: `s:${FRIEND}` },
    }),
  ],
  salary_components: [rowFor('salary_components', { id: COMPONENT, name: 'Basic pay' })],
  budget_years: [rowFor('budget_years', { id: YEAR, name: 'FY', start_date: CREATED })],
  budget_lines: [
    rowFor('budget_lines', {
      id: LINE,
      budget_year_id: YEAR,
      rule: { accounts: [FRIEND, '77777777-7777-4777-8777-777777777777'] },
    }),
  ],
};

const file: ExportFile = {
  format: EXPORT_FORMAT,
  version: EXPORT_VERSION,
  exportId: '88888888-8888-4888-8888-888888888888',
  exportedAt: '2026-11-13T16:00:00.000Z',
  tables: encodeTables(raw),
};

let counter = 0;
const newId = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
};

describe('data transfer codec', () => {
  it('replaces ids with small handles and drops nothing else', () => {
    const text = JSON.stringify(file);
    for (const id of [FRIEND, STATEMENT, COMPONENT, YEAR, LINE]) {
      expect(text).not.toContain(id);
    }
    expect(text).toContain('77777777-7777-4777-8777-777777777777');
    expect(text).toContain('s:@@0');
  });

  it('survives compression', async () => {
    expect(await parseExport(await serializeExport(file))).toEqual(file);
  });

  it('writes timestamps back with microseconds', () => {
    expect(microsToTimestamp(CREATED)).toBe('2026-11-13T14:40:18.123456');
  });

  it('gives every row a new id and follows references', () => {
    counter = 0;
    const plan = planImport(file, { userId: 'new-user', existing: {}, newId });
    const friend = plan.rows.friends_profiles.at(0);
    const statement = plan.rows.statements.at(0);
    expect(friend?.user_id).toBe('new-user');
    expect(statement?.friend_id).toBe(friend?.id);
    expect(statement?.additional_attributes).toEqual({
      recurringPaymentId: 'not-an-id',
      note: `s:${String(friend?.id)}`,
    });
    expect(statement?.created_at).toBe('2026-11-13T14:40:18.123456');
    expect(plan.rows.budget_lines.at(0)?.rule).toEqual({
      accounts: [friend?.id, '77777777-7777-4777-8777-777777777777'],
    });
  });

  it('reuses or keeps existing rows and skips their children', () => {
    counter = 0;
    const plan = planImport(file, {
      userId: 'me',
      newId,
      existing: {
        salary_components: new Map([[JSON.stringify(['Basic pay']), EXISTING_COMPONENT]]),
        budget_years: new Map([[JSON.stringify([CREATED]), YEAR]]),
      },
    });
    expect(plan.counts.salary_components).toEqual({ imported: 0, skipped: 1 });
    expect(plan.counts.budget_years).toEqual({ imported: 0, skipped: 1 });
    expect(plan.counts.budget_lines).toEqual({ imported: 0, skipped: 1 });
    expect(plan.counts.statements).toEqual({ imported: 1, skipped: 0 });
  });
});
