import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as authSchema from '@/db/auth-schema';
import * as schema from '@/db/schema';

import { excludedTables, transferTables } from './tables';

const allTables: PgTable[] = [...Object.values(schema), ...Object.values(authSchema)].flatMap(
  (value: unknown) => (is(value, PgTable) ? [value] : []),
);

describe('data transfer tables', () => {
  it('classifies every table as exported or excluded', () => {
    const exported = new Set(transferTables.map((table) => table.name));
    const unclassified = allTables
      .map((table) => getTableConfig(table).name)
      .filter((name) => !exported.has(name) && !Object.hasOwn(excludedTables, name));
    expect(unclassified).toEqual([]);
  });

  it('never exports and excludes the same table', () => {
    expect(transferTables.filter((table) => Object.hasOwn(excludedTables, table.name))).toEqual([]);
  });

  it('lists every table after the tables it references', () => {
    const position = new Map(transferTables.map((table, index) => [table.name, index]));
    const late = allTables.flatMap((table) => {
      const config = getTableConfig(table);
      const own = position.get(config.name);
      if (own === undefined) {
        return [];
      }
      return config.foreignKeys
        .map((key) => getTableConfig(key.reference().foreignTable).name)
        .filter((target) => (position.get(target) ?? -1) > own)
        .map((target) => `${config.name} -> ${target}`);
    });
    expect(late).toEqual([]);
  });

  it('scopes tables without a user column through a parent', () => {
    expect(
      transferTables
        .filter((table) => !table.ownedByUser && table.scope === null)
        .map((table) => table.name),
    ).toEqual([]);
  });
});
