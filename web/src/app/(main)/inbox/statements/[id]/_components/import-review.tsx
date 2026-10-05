'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { toast } from 'sonner';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import { useDataTable } from '@/hooks/use-data-table';
import { formatCurrency } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';

import { BalanceStrip, balanceAfter } from './review-balance';
import { ledgerOnlyColumns, reviewColumns } from './review-columns';
import {
  buildLedgerOnlyRows,
  buildReviewRows,
  type Decision,
  groupTints,
  groupTogether,
  initialDecisions,
  type Review,
  ROW_STATUSES,
  type RowStatus,
  toPaise,
} from './review-model';

import { ImportStatusBadge } from '../../../_components/import-status-badge';
import {
  formatDay,
  formatPeriod,
  signedCurrency,
  issuerLabel,
} from '../../../_components/statement-labels';

const NeighbourLink = ({
  direction,
  target,
}: {
  direction: 'previous' | 'next';
  target: Review['neighbours']['previous'];
}) => {
  const label = direction === 'previous' ? 'Previous' : 'Next';
  const content =
    direction === 'previous' ? (
      <>
        <ChevronLeft className="size-4" />
        {label}
      </>
    ) : (
      <>
        {label}
        <ChevronRight className="size-4" />
      </>
    );
  if (target === null) {
    return (
      <Button disabled size="sm" variant="outline">
        {content}
      </Button>
    );
  }
  return (
    <Button
      asChild
      size="sm"
      title={formatPeriod(target.periodStart, target.periodEnd)}
      variant="outline"
    >
      <Link href={`/inbox/statements/${target.id}`}>{content}</Link>
    </Button>
  );
};

const ACTION_STATUSES: RowStatus[] = ['missing', 'amount_differs', 'outside_period'];
const DEFAULT_STATUSES = ROW_STATUSES.filter((status) => status !== 'exact');

const initialStatuses = (rows: Array<{ status: RowStatus }>) => {
  const present = new Set(rows.map((row) => row.status));
  const actions = ACTION_STATUSES.filter((status) => present.has(status));
  if (actions.length > 0) {
    return actions;
  }
  return DEFAULT_STATUSES.some((status) => present.has(status)) ? DEFAULT_STATUSES : null;
};

const changes = (count: number) => `${String(count)} ${count === 1 ? 'change' : 'changes'}`;

const applyHint = (blocked: boolean, acceptedCount: number) => {
  if (blocked) {
    return acceptedCount === 0
      ? 'Select the changes to save. Marking this statement as checked waits for the earlier ones.'
      : `${changes(acceptedCount)} selected. They are saved now and this statement stays open.`;
  }
  return acceptedCount === 0
    ? 'Nothing selected. Applying marks this statement as checked.'
    : `${changes(acceptedCount)} selected.`;
};

const BlockedNotice = ({
  review,
  blockedBy,
}: {
  review: Review;
  blockedBy: NonNullable<Review['blockedBy']>;
}) => {
  const { appOpening, statementOpening } = review.balance;
  const offBy = statementOpening === null ? null : appOpening - statementOpening;
  const waiting =
    blockedBy.waiting === 1
      ? 'An earlier statement is'
      : `${String(blockedBy.waiting)} earlier statements are`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
      <span className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          {offBy === null || statementOpening === null
            ? 'Your ledger does not match the bank at the start of this statement. '
            : `Your ledger starts ${signedCurrency(offBy)} away from the bank (${formatCurrency(appOpening)} vs ${formatCurrency(statementOpening)}). `}
          {waiting} still waiting, and the difference comes from there. You can save fixes here now;
          marking this statement as checked waits until those are done.
        </span>
      </span>
      <Button asChild size="sm" variant="outline">
        <Link href={`/inbox/statements/${blockedBy.id}`}>
          Start with {formatPeriod(blockedBy.periodStart, blockedBy.periodEnd)}
        </Link>
      </Button>
    </div>
  );
};

const countStatuses = (statuses: RowStatus[]) =>
  Object.fromEntries(
    ROW_STATUSES.map((status) => [status, statuses.filter((entry) => entry === status).length]),
  ) as Record<RowStatus, number>;

export const ImportReview = ({
  review,
  accounts,
  categories,
  tags,
}: {
  review: Review;
  accounts: Array<{ id: string; accountName: string }>;
  categories: string[];
  tags: string[];
}) => {
  const router = useRouter();
  const [decisions, setDecisions] = useState(() => initialDecisions(review));
  const apply = api.statementImports.applyChanges.useMutation();
  const editable = review.import.status === 'review';
  const blocked = review.blockedBy !== null;

  const update = (ids: string[], change: Partial<Decision>) => {
    setDecisions((current) => {
      const next = { ...current };
      for (const id of ids) {
        const existing = next[id];
        if (existing !== undefined) {
          next[id] = { ...existing, ...change };
        }
      }
      return next;
    });
  };

  const [statusFilter] = useQueryState('status', parseAsArrayOf(parseAsString, ','));
  const builtRows = useMemo(() => buildReviewRows(review), [review]);
  const filtered = statusFilter !== null && statusFilter.length > 0;
  const rows = useMemo(
    () => (filtered ? groupTogether(builtRows) : builtRows),
    [builtRows, filtered],
  );
  const tints = useMemo(
    () =>
      statusFilter === null || statusFilter.length === 0
        ? null
        : groupTints(rows.filter((row) => statusFilter.includes(row.status))),
    [statusFilter, rows],
  );
  const ledgerOnly = useMemo(() => buildLedgerOnlyRows(review), [review]);
  const counts = useMemo(() => countStatuses(rows.map((row) => row.status)), [rows]);
  const { closingAfter, remaining, acceptedCount } = useMemo(
    () => balanceAfter(review, decisions),
    [review, decisions],
  );

  const { table } = useDataTable({
    data: rows,
    columns: reviewColumns({
      decisions,
      update,
      editable,
      accountId: review.import.accountId,
      accounts,
      categories,
      tags,
      ledger: review.ledger,
      counts,
    }),
    pageCount: -1,
    manualFiltering: false,
    getRowId: (row) => row.id,
  });
  const defaulted = useRef(false);
  useEffect(() => {
    if (!defaulted.current) {
      defaulted.current = true;
      if (statusFilter === null) {
        const statuses = initialStatuses(builtRows);
        if (statuses !== null) {
          table.getColumn('status')?.setFilterValue(statuses);
        }
      }
    }
  }, [builtRows, statusFilter, table]);
  const { table: ledgerTable } = useDataTable({
    data: ledgerOnly,
    columns: ledgerOnlyColumns(),
    pageCount: -1,
    getRowId: (row) => row.id,
  });

  const submit = () => {
    apply.mutate(
      {
        id: review.import.id,
        finish: !blocked,
        decisions: review.suggestions.flatMap((suggestion) => {
          const decision = decisions[suggestion.id];
          if (decision?.accepted !== true || suggestion.type === 'not_on_statement') {
            return [];
          }
          return [
            {
              id: suggestion.id,
              mode: decision.mode,
              statementKind: decision.statementKind,
              category: decision.category,
              tags: decision.tags,
              counterpartyAccountId: decision.counterpartyAccountId,
            },
          ];
        }),
      },
      {
        onSuccess: (result) => {
          toast.success(
            [
              `${String(result.added)} added`,
              `${String(result.adjusted)} corrected`,
              result.redated > 0 ? `${String(result.redated)} moved` : null,
              blocked ? 'statement still open' : null,
            ]
              .filter((part) => part !== null)
              .join(', '),
          );
          router.refresh();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const info = review.import;
  const totalLabel = info.kind === 'bank_account' ? 'closing balance' : 'amount due';
  const totalsDiffer =
    info.summary.declared !== null &&
    (toPaise(info.summary.declared.debits) !== toPaise(info.summary.totals.debits) ||
      toPaise(info.summary.declared.credits) !== toPaise(info.summary.totals.credits));

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            {info.accountName}
            <ImportStatusBadge status={info.status} />
          </h3>
          <span className="text-muted-foreground text-sm">
            {issuerLabel(info.issuer)} · {formatPeriod(info.periodStart, info.periodEnd)} ·{' '}
            {review.rows.length} rows
            {info.totalDue === null ? '' : ` · ${totalLabel} ${formatCurrency(info.totalDue)}`}
            {info.summary.dueDate === null ? '' : ` by ${formatDay(info.summary.dueDate)}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <NeighbourLink direction="previous" target={review.neighbours.previous} />
          <NeighbourLink direction="next" target={review.neighbours.next} />
          <Button asChild size="sm" variant="outline">
            <Link href={`/inbox/statements?account=${info.accountId}`}>
              All {info.accountName} statements
            </Link>
          </Button>
        </div>
      </div>

      {review.blockedBy === null ? null : (
        <BlockedNotice blockedBy={review.blockedBy} review={review} />
      )}

      {totalsDiffer ? (
        <div className="border-destructive/40 bg-destructive/5 rounded-md border px-4 py-3 text-sm">
          The rows read from this file do not add up to the totals printed on it, so some rows may
          be missing. Check the suggestions carefully.
        </div>
      ) : null}

      <BalanceStrip closingAfter={closingAfter} remaining={remaining} review={review} />

      <DataTable
        enablePagination={false}
        getItemValue={(item) => item.id}
        getRowClassName={(item) => tints?.get(item.groupKey)}
        table={table}
      >
        <DataTableToolbar table={table} title="On the statement" />
      </DataTable>

      {ledgerOnly.length === 0 ? null : (
        <DataTable enablePagination={false} getItemValue={(item) => item.id} table={ledgerTable}>
          <DataTableToolbar
            table={ledgerTable}
            title="In your ledger, not on this statement"
            viewOptions={false}
          />
        </DataTable>
      )}

      {info.status === 'review' ? (
        <div className="bg-background/95 sticky bottom-0 flex items-center justify-between gap-2 border-t py-3">
          <span className="text-muted-foreground text-sm">{applyHint(blocked, acceptedCount)}</span>
          <Button disabled={(blocked && acceptedCount === 0) || apply.isPending} onClick={submit}>
            {acceptedCount === 0 ? 'Mark as checked' : `Apply ${changes(acceptedCount)}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
