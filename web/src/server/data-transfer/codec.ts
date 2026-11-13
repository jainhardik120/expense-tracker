import { promisify } from 'node:util';
import { brotliCompress, brotliDecompress, constants } from 'node:zlib';

import { z } from 'zod';

import { transferTables, type TransferColumn, type TransferTable } from './tables';

export const EXPORT_FORMAT = 'expense-tracker-export';
export const EXPORT_VERSION = 1;

const BROTLI_QUALITY = 11;
const MICROS_PER_MILLI = 1000;
const MICROS_PER_SECOND = 1_000_000;
const ISO_SECONDS_LENGTH = 19;
const MICRO_DIGITS = 6;
const REF_PREFIX = '@@';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const HANDLE_PATTERN = /^@@\d+$/u;
const PREFIX_PATTERN = /^[a-z]+:$/u;
const MAX_PREFIX_LENGTH = 12;

const splitPrefix = (text: string) => {
  const colon = text.indexOf(':');
  if (colon <= 0 || colon >= MAX_PREFIX_LENGTH) {
    return { prefix: '', rest: text };
  }
  const prefix = text.slice(0, colon + 1);
  return PREFIX_PATTERN.test(prefix)
    ? { prefix, rest: text.slice(colon + 1) }
    : { prefix: '', rest: text };
};

const isRef = (text: string) => HANDLE_PATTERN.test(splitPrefix(text).rest);

const tableDumpSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
});

const exportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportId: z.uuid(),
  exportedAt: z.iso.datetime(),
  tables: z.record(z.string(), tableDumpSchema),
});

export type ExportFile = z.infer<typeof exportFileSchema>;

type TableDump = z.infer<typeof tableDumpSchema>;

export const lookup = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

type Row = unknown[];

const mapJson = (value: unknown, mapString: (text: string) => string | null): unknown => {
  if (typeof value === 'string') {
    return mapString(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'string' && mapString(item) === null && isRef(item)
          ? undefined
          : mapJson(item, mapString),
      )
      .filter((item) => item !== undefined);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, mapJson(item, mapString)]),
    );
  }
  return value;
};

export const encodeTables = (raw: Partial<Record<string, Row[]>>): ExportFile['tables'] => {
  const handles = new Map<string, number>();
  for (const table of transferTables) {
    const idIndex = table.columns.findIndex((column) => column.isId);
    if (idIndex === -1) {
      continue;
    }
    for (const row of raw[table.name] ?? []) {
      const id = row[idIndex];
      if (typeof id === 'string' && !handles.has(id)) {
        handles.set(id, handles.size);
      }
    }
  }

  const toRef = (text: string) => {
    const { prefix, rest } = splitPrefix(text);
    const handle = UUID_PATTERN.test(rest) ? handles.get(rest.toLowerCase()) : undefined;
    return handle === undefined ? null : prefix + REF_PREFIX + String(handle);
  };

  const encodeValue = (column: TransferColumn, value: unknown) => {
    if (value === null) {
      return null;
    }
    if (column.kind === 'uuid') {
      return handles.get(String(value).toLowerCase()) ?? null;
    }
    if (column.kind === 'json') {
      return mapJson(value, toRef);
    }
    return value;
  };

  return Object.fromEntries(
    transferTables.map((table) => [
      table.name,
      {
        columns: table.columns.map((column) => column.name),
        rows: (raw[table.name] ?? []).map((row) =>
          table.columns.map((column, index) => encodeValue(column, row[index])),
        ),
      },
    ]),
  );
};

const compress = promisify(brotliCompress);
const decompress = promisify(brotliDecompress);

export const serializeExport = (file: ExportFile) =>
  compress(Buffer.from(JSON.stringify(file)), {
    params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
  });

export const parseExport = async (data: Buffer): Promise<ExportFile> =>
  exportFileSchema.parse(JSON.parse((await decompress(data)).toString('utf8')));

export const microsToTimestamp = (micros: number) => {
  const seconds = Math.floor(micros / MICROS_PER_SECOND);
  const fraction = String(micros - seconds * MICROS_PER_SECOND).padStart(MICRO_DIGITS, '0');
  const base = new Date(seconds * MICROS_PER_MILLI).toISOString().slice(0, ISO_SECONDS_LENGTH);
  return `${base}.${fraction}`;
};

export const conflictKey = (values: unknown[]) => JSON.stringify(values);

export type ExistingRows = Partial<Record<string, Map<string, string | null>>>;

export type ImportPlan = {
  rows: Record<string, Record<string, unknown>[]>;
  counts: Record<string, { imported: number; skipped: number }>;
};

const handleOf = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

const planTable = (
  table: TransferTable,
  dump: TableDump | undefined,
  context: {
    userId: string;
    ids: Map<number, string>;
    existing: ExistingRows;
    newId: () => string;
  },
) => {
  const fileIndex = new Map((dump?.columns ?? []).map((name, index) => [name, index]));
  const columns = table.columns.filter((column) => fileIndex.has(column.name));
  const idColumn = columns.find((column) => column.isId);
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  const read = (row: Row, name: string) => row[fileIndex.get(name) ?? -1] ?? null;
  const fromRef = (text: string) => {
    const { prefix, rest } = splitPrefix(text);
    const id = HANDLE_PATTERN.test(rest)
      ? context.ids.get(Number(rest.slice(REF_PREFIX.length)))
      : undefined;
    return id === undefined ? null : prefix + id;
  };

  for (const row of dump?.rows ?? []) {
    const handle = idColumn === undefined ? null : handleOf(read(row, idColumn.name));
    if (table.conflict !== null) {
      const existing = context.existing[table.name]?.get(
        conflictKey(table.conflict.key.map((name) => read(row, name))),
      );
      if (existing !== undefined) {
        if (handle !== null) {
          if (table.conflict.onConflict === 'reuse' && existing !== null) {
            context.ids.set(handle, existing);
          } else {
            context.ids.delete(handle);
          }
        }
        skipped += 1;
        continue;
      }
    }

    const record: Record<string, unknown> = table.ownedByUser ? { user_id: context.userId } : {};
    let keep = true;
    for (const column of columns) {
      const value = read(row, column.name);
      if (value === null) {
        record[column.name] = null;
      } else if (column.kind === 'uuid') {
        const ref = handleOf(value);
        const id = ref === null ? undefined : context.ids.get(ref);
        if (id === undefined && column.notNull) {
          keep = false;
          break;
        }
        record[column.name] = id ?? null;
      } else if (column.kind === 'timestamp') {
        record[column.name] = microsToTimestamp(Number(value));
      } else if (column.kind === 'json') {
        record[column.name] = mapJson(value, fromRef);
      } else {
        record[column.name] = value;
      }
    }
    if (!keep) {
      if (handle !== null) {
        context.ids.delete(handle);
      }
      skipped += 1;
      continue;
    }
    rows.push(record);
  }
  return { rows, skipped };
};

export const planImport = (
  file: ExportFile,
  options: { userId: string; existing: ExistingRows; newId: () => string },
): ImportPlan => {
  const ids = new Map<number, string>();
  for (const table of transferTables) {
    const dump = lookup(file.tables, table.name);
    const idIndex = dump?.columns.indexOf('id') ?? -1;
    if (idIndex === -1) {
      continue;
    }
    for (const row of dump?.rows ?? []) {
      const handle = handleOf(row[idIndex]);
      if (handle !== null) {
        ids.set(handle, options.newId());
      }
    }
  }

  const plan: ImportPlan = { rows: {}, counts: {} };
  for (const table of transferTables) {
    const dump = lookup(file.tables, table.name);
    const { rows, skipped } = planTable(table, dump, { ...options, ids });
    plan.rows[table.name] = rows;
    plan.counts[table.name] = { imported: rows.length, skipped };
  }
  return plan;
};
