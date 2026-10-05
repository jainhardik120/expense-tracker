'use client';

import { useRouter } from 'next/navigation';

import { CheckCheck, Merge, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ZonedDate } from '@/components/zoned-date';
import { DATE_FORMAT, formatCurrency } from '@/lib/format';
import type { ColumnDef } from '@/lib/table';
import { cn, errorMessage } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';
import { type Account, type Friend } from '@/types';

import { MergeMatchesDialog } from './merge-matches-dialog';
import { ResolveInboxDialog } from './resolve-inbox-dialog';

import { signedAmountClassName } from '../../statements/_components/statement-appearance';

export type InboxEntry = RouterOutput['friends']['getInbox']['entries'][number];

const STATUS_LABELS: Record<InboxEntry['status'], string> = {
  pending: 'To review',
  accepted: 'Added',
  dismissed: 'Ignored',
};

const STATUS_VARIANTS: Record<InboxEntry['status'], 'default' | 'secondary' | 'outline'> = {
  pending: 'default',
  accepted: 'secondary',
  dismissed: 'outline',
};

const becameLabel = (entry: InboxEntry) => {
  if (entry.status !== 'accepted') {
    return '-';
  }
  if (entry.resolvedKind === 'expense') {
    return `Expense paid by ${entry.friendName}`;
  }
  return entry.resolvedAccountName ?? 'Not through an account';
};

const ReopenAction = ({ id }: { id: string }) => {
  const router = useRouter();
  const mutation = api.friends.reopenInboxEntries.useMutation();
  return (
    <RowActionTrigger
      disabled={mutation.isPending}
      icon={RotateCcw}
      label="Review again"
      onClick={() => {
        mutation
          .mutateAsync({ ids: [id] })
          .then(() => {
            router.refresh();
            return undefined;
          })
          .catch((error: unknown) => toast.error(errorMessage(error)));
      }}
    />
  );
};

export const createInboxColumns = ({
  accountsData,
  friendsData,
  categories,
}: {
  accountsData: Account[];
  friendsData: Friend[];
  categories: string[];
}): ColumnDef<InboxEntry>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all"
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        className="translate-y-0.5"
        onCheckedChange={(value) => {
          table.toggleAllPageRowsSelected(value === true);
        }}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        className="translate-y-0.5"
        disabled={row.original.status !== 'pending'}
        onCheckedChange={(value) => {
          row.toggleSelected(value === true);
        }}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    meta: { selectable: false },
    size: 40,
  },
  {
    id: 'date',
    accessorKey: 'occurredAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => <ZonedDate pattern={DATE_FORMAT.dateTime} value={row.original.occurredAt} />,
    meta: { label: 'Date', variant: 'dateRange' },
    enableColumnFilter: true,
    enableSorting: true,
  },
  {
    id: 'friend',
    accessorKey: 'friendName',
    header: 'Friend',
    enableSorting: false,
    cell: ({ row }) => <span className="font-medium">{row.original.friendName}</span>,
    meta: {
      label: 'Friend',
      variant: 'multiSelect',
      options: friendsData
        .filter((friend) => friend.linkedUserId !== null)
        .map((friend) => ({ label: friend.name, value: friend.id })),
    },
    enableColumnFilter: true,
  },
  {
    id: 'kind',
    accessorKey: 'kind',
    header: 'What',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.kind === 'paid' ? (
        <span>You paid for {row.original.friendName}</span>
      ) : (
        <span>Transfer</span>
      ),
  },
  {
    id: 'from',
    header: 'From',
    enableSorting: false,
    cell: ({ row }) => (Number(row.original.amount) > 0 ? row.original.friendName : 'You'),
  },
  {
    id: 'to',
    header: 'To',
    enableSorting: false,
    cell: ({ row }) => (Number(row.original.amount) > 0 ? 'You' : row.original.friendName),
  },
  {
    id: 'amount',
    accessorKey: 'amount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
    cell: ({ row }) => {
      const amount = Number(row.original.amount);
      return (
        <span className={cn('font-medium tabular-nums', signedAmountClassName(amount))}>
          {formatCurrency(amount)}
        </span>
      );
    },
    meta: { align: 'right', label: 'Amount' },
    enableSorting: true,
  },
  {
    id: 'category',
    accessorKey: 'category',
    header: 'Their category',
    enableSorting: false,
  },
  {
    id: 'tags',
    accessorKey: 'tags',
    header: 'Their tags',
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANTS[row.original.status]}>
        {STATUS_LABELS[row.original.status]}
      </Badge>
    ),
    meta: {
      label: 'Status',
      variant: 'multiSelect',
      options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ label, value })),
    },
    enableColumnFilter: true,
  },
  {
    id: 'match',
    header: 'Already in your statements',
    enableSorting: false,
    cell: ({ row }) => {
      const { match, amount } = row.original;
      if (match === null) {
        return <span className="text-muted-foreground">-</span>;
      }
      const gap = Math.abs(Number(match.amount) - Number(amount));
      return (
        <div className="flex flex-col">
          <span>
            <ZonedDate value={match.occurredAt} /> · {formatCurrency(match.amount)}
          </span>
          <span className="text-muted-foreground text-xs">
            {match.statementKind === 'expense'
              ? `Expense paid by ${row.original.friendName}`
              : (match.accountName ?? 'No account')}{' '}
            · {match.category}
            {gap > 0 ? ` · ${formatCurrency(gap)} apart` : ''}
          </span>
        </div>
      );
    },
  },
  {
    id: 'became',
    header: 'Became',
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span>{becameLabel(row.original)}</span>
        {row.original.resolvedCategory !== null &&
        row.original.resolvedCategory !== row.original.category ? (
          <span className="text-muted-foreground text-xs">{row.original.resolvedCategory}</span>
        ) : null}
      </div>
    ),
  },
  {
    id: 'resolvedAt',
    accessorKey: 'resolvedAt',
    header: 'Answered',
    enableSorting: false,
    cell: ({ row }) => <ZonedDate value={row.original.resolvedAt} />,
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    enableHiding: false,
    meta: { label: 'Actions', selectable: false },
    cell: ({ row }) => {
      const entry = row.original;
      if (entry.status !== 'pending') {
        return (
          <RowActions>
            <ReopenAction id={entry.id} />
          </RowActions>
        );
      }
      return (
        <RowActions collapse="always">
          {entry.match === null ? null : (
            <MergeMatchesDialog
              entries={[entry]}
              trigger={<RowActionTrigger icon={Merge} label="Merge, keep mine" />}
            />
          )}
          <ResolveInboxDialog
            accountsData={accountsData}
            categories={categories}
            entries={[entry]}
            trigger={<RowActionTrigger icon={CheckCheck} label="Resolve" />}
          />
        </RowActions>
      );
    },
  },
];
