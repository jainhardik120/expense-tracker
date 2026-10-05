'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { formatDistanceToNow } from 'date-fns';
import { Archive, ArchiveRestore, CircleCheck, Eye, Loader2, Trash } from 'lucide-react';
import { toast } from 'sonner';

import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';
import type { ColumnDef } from '@/lib/table';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { ImportStatusBadge } from '../../_components/import-status-badge';
import { formatPeriod, issuerLabel, signedCurrency } from '../../_components/statement-labels';

type Imports = RouterOutput['statementImports']['list'];

const outcomeText = (row: Imports[number]) => {
  if (row.status !== 'applied' || row.outcome === null) {
    return row.rowCount === 1 ? '1 row' : `${String(row.rowCount)} rows`;
  }
  const parts = [
    row.outcome.added > 0 ? `${String(row.outcome.added)} added` : null,
    row.outcome.adjusted > 0 ? `${String(row.outcome.adjusted)} corrected` : null,
    row.outcome.redated > 0 ? `${String(row.outcome.redated)} moved` : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? 'Already matched' : parts.join(', ');
};

const StatusAction = ({ row }: { row: Imports[number] }) => {
  const router = useRouter();
  const setStatus = api.statementImports.setStatus.useMutation();
  const next = row.status === 'review' ? 'discarded' : 'review';
  return (
    <RowActionTrigger
      icon={next === 'discarded' ? Archive : ArchiveRestore}
      label={next === 'discarded' ? 'Discard' : 'Review again'}
      onClick={() => {
        setStatus.mutate(
          { id: row.id, status: next },
          {
            onSuccess: router.refresh,
            onError: (error) => toast.error(errorMessage(error)),
          },
        );
      }}
    />
  );
};

const OpenAction = ({ row }: { row: Imports[number] }) => {
  const router = useRouter();
  return (
    <RowActionTrigger
      icon={Eye}
      label={row.status === 'review' ? 'Review' : 'Open'}
      onClick={() => {
        router.push(`/inbox/statements/${row.id}`);
      }}
    />
  );
};

const DeleteImport = ({ row }: { row: Imports[number] }) => {
  const router = useRouter();
  const mutation = api.statementImports.delete.useMutation();
  return (
    <DeleteConfirmationDialog
      description={
        row.status === 'applied'
          ? 'The import record is removed. Rows it added or corrected stay in your ledger.'
          : 'The import is removed. Nothing in your ledger changes.'
      }
      mutation={mutation}
      mutationInput={{ id: row.id }}
      refresh={router.refresh}
      successToast={() => 'Import removed'}
    >
      <RowActionTrigger destructive icon={Trash} label="Delete" />
    </DeleteConfirmationDialog>
  );
};

const ledgerDirection = (value: number) => {
  const side = value > 0 ? 'higher' : 'lower';
  return `Your ledger is ${formatCurrency(Math.abs(value))} ${side} than the bank for this statement. `;
};

const plural = (count: number, word: string) => `${String(count)} ${word}`;

const matchesOf = (check: NonNullable<Imports[number]['check']>) =>
  check.add === 0 && check.adjust === 0 && check.notOnStatement === 0;

const matchDetails = (check: NonNullable<Imports[number]['check']>) =>
  [
    check.add > 0 ? plural(check.add, 'to add') : null,
    check.adjust > 0 ? plural(check.adjust, 'to fix') : null,
    check.notOnStatement > 0 ? plural(check.notOnStatement, 'not on statement') : null,
    check.elsewhere > 0 ? plural(check.elsewhere, 'on another statement') : null,
    check.likelyNext > 0 ? plural(check.likelyNext, 'likely on next statement') : null,
    check.redate + (check.outside ?? 0) > 0
      ? plural(check.redate + (check.outside ?? 0), 'dated outside')
      : null,
  ].filter((part) => part !== null);

const MatchCell = ({ row, checking }: { row: Imports[number]; checking: boolean }) => {
  const { check } = row;
  if (row.status === 'discarded') {
    return <span className="text-muted-foreground text-xs">-</span>;
  }
  if (check === null) {
    return (
      <span className="text-muted-foreground flex items-center gap-1 text-xs">
        {checking ? <Loader2 className="size-3 animate-spin" /> : null}
        {checking ? 'Checking' : 'Not checked'}
      </span>
    );
  }
  const checkedAgo = `Checked ${formatDistanceToNow(new Date(check.computedAt), { addSuffix: true })}`;
  if (matchesOf(check)) {
    return (
      <Badge
        className="bg-emerald-600 text-white hover:bg-emerald-600"
        suppressHydrationWarning
        title={checkedAgo}
      >
        <CircleCheck className="size-3" />
        Matches
      </Badge>
    );
  }
  const ledgerMinusBank = check.gap === null ? null : -check.gap;
  const direction =
    ledgerMinusBank === null || ledgerMinusBank === 0 ? '' : ledgerDirection(ledgerMinusBank);
  return (
    <Badge suppressHydrationWarning title={`${direction}${checkedAgo}`} variant="destructive">
      {ledgerMinusBank === null || ledgerMinusBank === 0
        ? plural(check.add + check.adjust + check.notOnStatement, 'changes')
        : `Off by ${signedCurrency(ledgerMinusBank)}`}
    </Badge>
  );
};

const DetailsCell = ({ row }: { row: Imports[number] }) => {
  if (row.status === 'discarded' || row.check === null) {
    return null;
  }
  const details = matchDetails(row.check);
  return details.length === 0 ? null : (
    <span className="text-muted-foreground text-xs">{details.join(' · ')}</span>
  );
};

export const importColumns = (
  checking: boolean,
  accountOptions: Array<{ label: string; value: string }>,
): Array<ColumnDef<Imports[number]>> => [
  {
    id: 'period',
    header: 'Period',
    cell: ({ row }) => (
      <Link className="font-medium hover:underline" href={`/inbox/statements/${row.original.id}`}>
        {formatPeriod(row.original.periodStart, row.original.periodEnd)}
      </Link>
    ),
    enableHiding: false,
  },
  {
    id: 'account',
    accessorFn: (row) => row.accountId,
    header: 'Account',
    cell: ({ row }) => (
      <span title={issuerLabel(row.original.issuer)}>{row.original.accountName}</span>
    ),
    filterFn: (row, _columnId, filterValue: unknown) =>
      !Array.isArray(filterValue) ||
      filterValue.length === 0 ||
      filterValue.includes(row.original.accountId),
    meta: { label: 'Account', variant: 'multiSelect', options: accountOptions },
    enableColumnFilter: true,
  },
  {
    id: 'source',
    header: 'From',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.source === 'email' ? 'Email' : 'Upload'}
      </span>
    ),
    meta: { label: 'From' },
  },
  {
    id: 'result',
    header: 'Result',
    cell: ({ row }) => <span className="text-muted-foreground">{outcomeText(row.original)}</span>,
    meta: { label: 'Result' },
  },
  {
    id: 'totalDue',
    header: 'Due or closing',
    cell: ({ row }) =>
      row.original.totalDue === null ? (
        '-'
      ) : (
        <span title={row.original.kind === 'bank_account' ? 'Closing balance' : 'Amount due'}>
          {formatCurrency(row.original.totalDue)}
        </span>
      ),
    meta: { align: 'right', label: 'Due or closing' },
  },
  {
    id: 'match',
    header: 'Match',
    cell: ({ row }) => <MatchCell checking={checking} row={row.original} />,
    meta: { label: 'Match' },
  },
  {
    id: 'details',
    header: 'Details',
    cell: ({ row }) => <DetailsCell row={row.original} />,
    meta: { label: 'Details' },
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <ImportStatusBadge status={row.original.status} />,
    meta: { label: 'Status' },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <RowActions>
        <OpenAction row={row.original} />
        {row.original.status === 'applied' ? null : <StatusAction row={row.original} />}
        <DeleteImport row={row.original} />
      </RowActions>
    ),
    enableHiding: false,
  },
];
