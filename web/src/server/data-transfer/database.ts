import { randomUUID } from 'node:crypto';

import { sql, type SQL } from 'drizzle-orm';

import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';

import {
  conflictKey,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  planImport,
  type ExistingRows,
  type ExportFile,
  type ImportPlan,
  encodeTables,
  lookup,
} from './codec';
import { transferTables, type TransferColumn, type TransferTable } from './tables';

const COMMA = sql`, `;

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

const valueExpression = (column: TransferColumn) => {
  const name = quote(column.name);
  if (column.kind === 'timestamp') {
    return `(extract(epoch from ${name}) * 1000000)::bigint`;
  }
  if (column.kind === 'numeric') {
    return `${name}::text`;
  }
  return name;
};

const scopeCondition = (table: TransferTable, userId: string): SQL => {
  if (table.scope === null) {
    return sql`${sql.raw(quote('user_id'))} = ${userId}`;
  }
  return sql`${sql.raw(quote(table.scope.column))} IN (SELECT "id" FROM ${sql.raw(
    quote(table.scope.parent),
  )} WHERE "user_id" = ${userId})`;
};

const tableRows = (table: TransferTable, userId: string): SQL => {
  const values = table.columns.map(valueExpression).join(', ');
  const order = table.orderBy === null ? '' : ` ORDER BY ${quote(table.orderBy)}`;
  return sql`(SELECT coalesce(json_agg(json_build_array(${sql.raw(values)})${sql.raw(
    order,
  )}), '[]'::json) FROM ${sql.raw(quote(table.name))} WHERE ${scopeCondition(table, userId)})`;
};

export const exportUserData = instrumentedFunction(
  'exportUserData',
  async (db: Database, userId: string): Promise<ExportFile> => {
    const pairs = transferTables.map(
      (table) => sql`${table.name}::text, ${tableRows(table, userId)}`,
    );
    const result = await db.execute<{ data: Partial<Record<string, unknown[][]>> }>(
      sql`SELECT json_build_object(${sql.join(pairs, COMMA)}) AS data`,
    );
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportId: randomUUID(),
      exportedAt: new Date().toISOString(),
      tables: encodeTables(result.rows.at(0)?.data ?? {}),
    };
  },
);

const existingRowsQuery = (table: TransferTable, userId: string): SQL => {
  const idColumn = table.columns.find((column) => column.isId);
  const keyColumns = (table.conflict?.key ?? []).map((name) => {
    const column = table.columns.find((entry) => entry.name === name);
    return column === undefined ? quote(name) : valueExpression(column);
  });
  const values = [idColumn === undefined ? 'NULL' : quote(idColumn.name), ...keyColumns];
  return sql`(SELECT coalesce(json_agg(json_build_array(${sql.raw(values.join(', '))})), '[]'::json) FROM ${sql.raw(
    quote(table.name),
  )} WHERE "user_id" = ${userId})`;
};

const loadExisting = async (db: Database, userId: string, exportId: string) => {
  const conflictTables = transferTables.filter((table) => table.conflict !== null);
  const pairs = conflictTables.map(
    (table) => sql`${table.name}::text, ${existingRowsQuery(table, userId)}`,
  );
  const result = await db.execute<{
    data: Partial<Record<string, unknown[][]>>;
    already_imported: boolean;
  }>(
    sql`SELECT json_build_object(${sql.join(pairs, COMMA)}) AS data,
      EXISTS (SELECT 1 FROM "data_imports" WHERE "user_id" = ${userId} AND "export_id" = ${exportId}) AS already_imported`,
  );
  const row = result.rows.at(0);
  const existing: ExistingRows = {};
  for (const table of conflictTables) {
    existing[table.name] = new Map(
      (row?.data[table.name] ?? []).map(([id, ...key]) => [
        conflictKey(key),
        typeof id === 'string' ? id : null,
      ]),
    );
  }
  return { existing, alreadyImported: row?.already_imported ?? false };
};

export type ImportSummary = {
  alreadyImported: boolean;
  exportedAt: string;
  counts: ImportPlan['counts'];
};

const insertStatement = (plan: ImportPlan, file: ExportFile, userId: string): SQL => {
  const steps: SQL[] = [sql`"payload" AS (SELECT ${JSON.stringify(plan.rows)}::jsonb AS "doc")`];
  for (const table of transferTables) {
    const first = lookup(plan.rows, table.name)?.at(0);
    if (first === undefined) {
      continue;
    }
    const columns = Object.keys(first).map(quote).join(', ');
    const alias = quote(`i_${table.name}`);
    steps.push(
      sql`${sql.raw(alias)} AS (INSERT INTO ${sql.raw(quote(table.name))} (${sql.raw(
        columns,
      )}) SELECT ${sql.raw(columns)} FROM "payload", jsonb_populate_recordset(NULL::${sql.raw(
        quote(table.name),
      )}, "payload"."doc" -> ${table.name}::text))`,
    );
  }
  const counts = Object.fromEntries(
    Object.entries(plan.counts).map(([name, count]) => [name, count.imported]),
  );
  steps.push(
    sql`"i_data_imports" AS (INSERT INTO "data_imports" ("user_id", "export_id", "exported_at", "counts", "created_at")
      VALUES (${userId}, ${file.exportId}, ${file.exportedAt}::timestamptz AT TIME ZONE 'UTC', ${JSON.stringify(
        counts,
      )}::jsonb, now() AT TIME ZONE 'UTC'))`,
  );
  return sql`WITH ${sql.join(steps, COMMA)} SELECT 1`;
};

export const importUserData = instrumentedFunction(
  'importUserData',
  async (
    db: Database,
    userId: string,
    file: ExportFile,
    options: { dryRun: boolean },
  ): Promise<ImportSummary> => {
    const { existing, alreadyImported } = await loadExisting(db, userId, file.exportId);
    const plan = planImport(file, { userId, existing, newId: randomUUID });
    if (!options.dryRun && !alreadyImported) {
      await db.execute(insertStatement(plan, file, userId));
    }
    return { alreadyImported, exportedAt: file.exportedAt, counts: plan.counts };
  },
);
