'use client';

import { useRouter } from 'next/navigation';

import { Plus, SquarePen, Trash } from 'lucide-react';

import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ZonedDate } from '@/components/zoned-date';
import { DATE_FORMAT, formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import {
  type CheckAccount,
  CreateBalanceCheckForm,
  UpdateBalanceCheckForm,
} from './balance-check-form';

type AccountChecks = RouterOutput['balanceChecks']['getOverview'][number];

const STATUS_ORDER: Record<AccountChecks['status'], number> = {
  mismatch: 0,
  matched: 1,
  unchecked: 2,
};

const differenceClassName = (value: number) =>
  value === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

const earlierChecksOff = (count: number) =>
  count === 1 ? '1 earlier check off' : `${count} earlier checks off`;

const StatusBadge = ({ account }: { account: AccountChecks }) => {
  if (account.status === 'matched') {
    return <Badge variant="secondary">Matches the bank</Badge>;
  }
  if (account.status === 'mismatch') {
    return (
      <Badge variant="destructive">
        {account.latestDifference === 0
          ? `${earlierChecksOff(account.mismatchedChecks)}`
          : `Off by ${formatCurrency(account.latestDifference)}`}
      </Badge>
    );
  }
  return <Badge variant="outline">Not checked</Badge>;
};

const DeleteCheck = ({ id }: { id: string }) => {
  const router = useRouter();
  const mutation = api.balanceChecks.deleteCheck.useMutation();
  return (
    <DeleteConfirmationDialog
      description="The check is removed. Your statements are not changed."
      mutation={mutation}
      mutationInput={{ id }}
      refresh={router.refresh}
      successToast={() => 'Balance check removed'}
    >
      <RowActionTrigger destructive icon={Trash} label="Delete" />
    </DeleteConfirmationDialog>
  );
};

const AccountChecksCard = ({
  account,
  accounts,
}: {
  account: AccountChecks;
  accounts: CheckAccount[];
}) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-2">
      <div className="flex flex-col gap-1.5">
        <CardTitle className="flex items-center gap-2">
          {account.accountName}
          <StatusBadge account={account} />
        </CardTitle>
        <CardDescription>
          App balance now {formatCurrency(account.balanceNow)}
          {account.correctedBalanceNow === null
            ? null
            : ` · Bank-corrected balance ${formatCurrency(account.correctedBalanceNow)}`}
          {account.isCreditCard ? ' · negative means owed' : null}
        </CardDescription>
      </div>
      <CreateBalanceCheckForm
        accountId={account.accountId}
        accounts={accounts}
        trigger={
          <Button size="sm" variant="outline">
            <Plus className="size-4" />
            Add check
          </Button>
        }
      />
    </CardHeader>
    <CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead className="text-right">Bank balance</TableHead>
            <TableHead className="text-right">App balance</TableHead>
            <TableHead className="text-right">Difference</TableHead>
            <TableHead className="text-right">Unexplained since previous check</TableHead>
            <TableHead>Note</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {account.checks.map((check) => (
            <TableRow key={check.id}>
              <TableCell>
                <ZonedDate pattern={DATE_FORMAT.dateTime} value={check.checkedAt} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(check.balance)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(check.computed)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right font-medium tabular-nums',
                  differenceClassName(check.matches ? 0 : check.difference),
                )}
              >
                {check.matches ? 'Matches' : formatCurrency(check.difference)}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {check.unexplainedSincePrevious === 0
                  ? '-'
                  : formatCurrency(check.unexplainedSincePrevious)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {check.note ?? (check.source === 'statement_import' ? 'From a statement' : '')}
              </TableCell>
              <TableCell>
                <RowActions>
                  <UpdateBalanceCheckForm
                    accounts={accounts}
                    check={{ ...check, accountId: account.accountId }}
                    trigger={<RowActionTrigger icon={SquarePen} label="Edit" />}
                  />
                  <DeleteCheck id={check.id} />
                </RowActions>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

const BalanceChecksView = ({ overview }: { overview: AccountChecks[] }) => {
  const accounts: CheckAccount[] = overview.map((account) => ({
    accountId: account.accountId,
    accountName: account.accountName,
    isCreditCard: account.isCreditCard,
  }));
  const checked = overview
    .filter((account) => account.status !== 'unchecked')
    .toSorted((left, right) => STATUS_ORDER[left.status] - STATUS_ORDER[right.status]);
  const unchecked = overview.filter((account) => account.status === 'unchecked');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground max-w-3xl text-sm">
          Note what your bank shows for an account at any moment. Each check compares it with what
          your statements add up to at that moment, so a gap shows how much is missing or wrong, and
          the gap since the previous check shows where.
        </p>
        <CreateBalanceCheckForm
          accounts={accounts}
          trigger={
            <Button className="h-8" variant="outline">
              <Plus className="size-4" />
              Add balance check
            </Button>
          }
        />
      </div>
      {checked.map((account) => (
        <AccountChecksCard key={account.accountId} account={account} accounts={accounts} />
      ))}
      {unchecked.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Not checked yet</CardTitle>
            <CardDescription>
              App balances that have never been compared with the bank.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {unchecked.map((account) => (
              <div key={account.accountId} className="flex items-center justify-between gap-2 py-2">
                <span className="font-medium">{account.accountName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {formatCurrency(account.balanceNow)}
                  </span>
                  <CreateBalanceCheckForm
                    accountId={account.accountId}
                    accounts={accounts}
                    trigger={
                      <Button size="sm" variant="ghost">
                        <Plus className="size-4" />
                        Check
                      </Button>
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default BalanceChecksView;
