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
import { formatPeriod, issuerLabel } from '../../_components/statement-labels';

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

const plural = (count: number, word: string) => `${String(count)} ${word}`;

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
  const matches = check.add === 0 && check.adjust === 0 && check.notOnStatement === 0;
  const notes = [
    check.elsewhere > 0 ? plural(check.elsewhere, 'on another statement') : null,
    check.likelyNext > 0 ? plural(check.likelyNext, 'likely on next statement') : null,
    check.redate > 0 ? plural(check.redate, 'dated outside') : null,
  ].filter((part) => part !== null);
  if (matches) {
    return (
      <div
        className="flex flex-col items-start gap-0.5"
        suppressHydrationWarning
        title={checkedAgo}
      >
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
          <CircleCheck className="size-3" />
          Matches
        </Badge>
        {notes.length === 0 ? null : (
          <span className="text-muted-foreground text-xs">{notes.join(' · ')}</span>
        )}
      </div>
    );
  }
  const details = [
    check.add > 0 ? plural(check.add, 'to add') : null,
    check.adjust > 0 ? plural(check.adjust, 'to fix') : null,
    check.notOnStatement > 0 ? plural(check.notOnStatement, 'not on statement') : null,
    ...notes,
  ].filter((part) => part !== null);
  return (
    <div className="flex flex-col items-start gap-0.5" suppressHydrationWarning title={checkedAgo}>
      <Badge variant="destructive">
        {check.gap === null || check.gap === 0
          ? plural(check.add + check.adjust + check.notOnStatement, 'changes')
          : `Off by ${formatCurrency(Math.abs(check.gap))}`}
      </Badge>
      {details.length === 0 ? null : (
        <span className="text-muted-foreground text-xs">{details.join(' · ')}</span>
      )}
    </div>
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
      <span>
        {row.original.accountName}
        <span className="text-muted-foreground"> · {issuerLabel(row.original.issuer)}</span>
      </span>
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
    id: 'totalDue',
    header: 'Amount due',
    cell: ({ row }) =>
      row.original.totalDue === null ? '-' : formatCurrency(row.original.totalDue),
    meta: { align: 'right', label: 'Amount due' },
  },
  {
    id: 'result',
    header: 'Result',
    cell: ({ row }) => <span className="text-muted-foreground">{outcomeText(row.original)}</span>,
    meta: { label: 'Result' },
  },
  {
    id: 'match',
    header: 'Match',
    cell: ({ row }) => <MatchCell checking={checking} row={row.original} />,
    meta: { label: 'Match' },
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
