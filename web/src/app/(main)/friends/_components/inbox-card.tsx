'use client';

import { useState } from 'react';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ZonedDate } from '@/components/zoned-date';
import { formatCurrency } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';
import { type InboxResolution } from '@/types';

const InboxCard = () => {
  const utils = api.useUtils();
  const { data: entries = [] } = api.friends.getInbox.useQuery();
  const { data: accounts = [] } = api.accounts.getAccounts.useQuery();
  const resolve = api.friends.resolveInboxEntries.useMutation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [accountId, setAccountId] = useState<string>('');

  if (entries.length === 0) {
    return null;
  }

  const visibleSelected = entries.filter((entry) => selected.has(entry.id));
  const allSelected = visibleSelected.length === entries.length;
  const allIncoming = visibleSelected.every((entry) => Number(entry.amount) > 0);

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelected(next);
  };

  const run = (resolution: InboxResolution, verb: string) => {
    resolve
      .mutateAsync({ ids: visibleSelected.map((entry) => entry.id), resolution })
      .then((result) => {
        toast.success(`${result.resolved} ${verb}`);
        setSelected(new Set());
        return Promise.all([utils.friends.getInbox.invalidate(), utils.statements.invalidate()]);
      })
      .catch((error: unknown) => toast.error(errorMessage(error)));
  };

  const nothingSelected = visibleSelected.length === 0 || resolve.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>To review</CardTitle>
        <CardDescription>
          Money your friends recorded moving between you. Say which of your accounts it touched, or
          that they paid for something of yours, and it becomes a statement. Amounts follow their
          edits; the category is yours.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Checkbox
            aria-label="Select all"
            checked={allSelected}
            onCheckedChange={(checked) => {
              setSelected(checked === true ? new Set(entries.map((entry) => entry.id)) : new Set());
            }}
          />
          <span className="text-muted-foreground text-sm">{visibleSelected.length} selected</span>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-44" size="sm">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.accountName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={nothingSelected || accountId === ''}
            size="sm"
            type="button"
            onClick={() => {
              run({ type: 'account', accountId }, 'added to the account');
            }}
          >
            Touched this account
          </Button>
          <Button
            disabled={nothingSelected || !allIncoming}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              run({ type: 'expense' }, 'added as expenses they paid');
            }}
          >
            They paid for me
          </Button>
          <Button
            disabled={nothingSelected}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => {
              run({ type: 'dismiss' }, 'ignored');
            }}
          >
            Ignore
          </Button>
        </div>
        <div className="flex flex-col divide-y">
          {entries.map((entry) => {
            const amount = Number(entry.amount);
            return (
              <label key={entry.id} className="flex cursor-pointer items-center gap-3 py-2">
                <Checkbox
                  checked={selected.has(entry.id)}
                  onCheckedChange={(checked) => {
                    toggle(entry.id, checked === true);
                  }}
                />
                <span className="text-muted-foreground w-24 shrink-0 text-sm">
                  <ZonedDate value={entry.occurredAt} />
                </span>
                <span className="flex-1 text-sm">
                  {amount > 0 ? `${entry.friendName} sent you` : `You sent ${entry.friendName}`}
                  <span className="text-muted-foreground"> · {entry.category}</span>
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {formatCurrency(Math.abs(amount))}
                </span>
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default InboxCard;
