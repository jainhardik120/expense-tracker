'use client';

import { useId, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { CircleAlert, CircleCheck, FileUp, KeyRound, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

type Outcome = RouterOutput['statementImports']['upload'];

export type ImportSource =
  | { kind: 'file'; file: File }
  | { kind: 'email'; inboundEmailId: string; attachment: number; fileName: string };

type Unlock = { password?: string; accountId?: string; rememberPassword: boolean };

type Item = {
  key: string;
  name: string;
  source: ImportSource;
  state: 'waiting' | 'working' | 'needs_password' | 'needs_account' | 'done' | 'failed';
  incorrectPassword?: boolean;
  issuer?: string;
  cardLast4?: string | null;
  importId?: string;
  duplicate?: boolean;
  message?: string;
  password: string;
  accountId: string;
};

type AccountOption = { id: string; accountName: string };

const toBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x80_00;
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCodePoint(...bytes.subarray(start, start + chunk));
  }
  return btoa(binary);
};

const nameOf = (source: ImportSource) =>
  source.kind === 'file' ? source.file.name : source.fileName;

const ItemRow = ({
  item,
  accounts,
  onChange,
  onRetry,
}: {
  item: Item;
  accounts: AccountOption[];
  onChange: (patch: Partial<Item>) => void;
  onRetry: () => void;
}) => (
  <div className="flex flex-col gap-2 rounded-md border p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-sm font-medium">{item.name}</span>
      {item.state === 'working' ? <Loader2 className="size-4 animate-spin" /> : null}
      {item.state === 'done' ? <CircleCheck className="size-4 text-emerald-600" /> : null}
      {item.state === 'failed' ? <CircleAlert className="text-destructive size-4" /> : null}
      {item.state === 'needs_password' ? <KeyRound className="size-4 text-amber-600" /> : null}
    </div>
    {item.state === 'needs_password' ? (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onRetry();
        }}
      >
        <span className="text-muted-foreground text-xs">
          {item.incorrectPassword === true
            ? 'That password did not open it. Try again.'
            : 'This PDF is locked. Enter the password your bank uses for statements.'}
        </span>
        <div className="flex gap-2">
          <Input
            autoComplete="off"
            placeholder="Statement password"
            type="password"
            value={item.password}
            onChange={(event) => {
              onChange({ password: event.target.value });
            }}
          />
          <Button disabled={item.password === ''} type="submit">
            Open
          </Button>
        </div>
      </form>
    ) : null}
    {item.state === 'needs_account' ? (
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">
          {item.issuer === 'Spreadsheet'
            ? 'This spreadsheet'
            : `This is a ${item.issuer ?? ''} statement`}
          {item.cardLast4 === null || item.cardLast4 === undefined
            ? ''
            : ` for the account ending ${item.cardLast4}`}
          . Which account is it? The app remembers your answer when it can.
        </span>
        <div className="flex gap-2">
          <Select
            value={item.accountId}
            onValueChange={(accountId) => {
              onChange({ accountId });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.accountName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={item.accountId === ''} onClick={onRetry}>
            Use it
          </Button>
        </div>
      </div>
    ) : null}
    {item.state === 'done' && item.importId !== undefined ? (
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {item.duplicate === true ? 'Imported before' : 'Read and ready to review'}
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={`/inbox/statements/${item.importId}`}>Review</Link>
        </Button>
      </div>
    ) : null}
    {item.state === 'failed' ? (
      <span className="text-destructive text-xs">{item.message}</span>
    ) : null}
  </div>
);

export const StatementImporter = ({
  accounts,
  trigger,
  initialSources = [],
}: {
  accounts: AccountOption[];
  trigger: React.ReactNode;
  initialSources?: ImportSource[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [rememberPassword, setRememberPassword] = useState(true);
  const rememberId = useId();
  const upload = api.statementImports.upload.useMutation();
  const fromEmail = api.statementImports.importFromEmail.useMutation();

  const patch = (key: string, change: Partial<Item>) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );
  };

  const apply = (key: string, outcome: Outcome) => {
    if (outcome.status === 'imported') {
      patch(key, { state: 'done', importId: outcome.importId, duplicate: outcome.duplicate });
    } else if (outcome.status === 'password') {
      patch(key, { state: 'needs_password', incorrectPassword: outcome.incorrect });
    } else if (outcome.status === 'account') {
      patch(key, { state: 'needs_account', issuer: outcome.issuer, cardLast4: outcome.cardLast4 });
    } else {
      patch(key, {
        state: 'failed',
        message: 'This bank or layout is not supported yet.',
      });
    }
  };

  const run = async (item: Item, unlock: Unlock) => {
    patch(item.key, { state: 'working' });
    try {
      const outcome =
        item.source.kind === 'file'
          ? await upload.mutateAsync({
              ...unlock,
              fileName: item.source.file.name,
              data: await toBase64(item.source.file),
            })
          : await fromEmail.mutateAsync({
              ...unlock,
              inboundEmailId: item.source.inboundEmailId,
              attachment: item.source.attachment,
            });
      apply(item.key, outcome);
    } catch (error) {
      patch(item.key, { state: 'failed', message: errorMessage(error) });
    }
    router.refresh();
  };

  const start = async (sources: ImportSource[]) => {
    const created = sources.map((source, position): Item => ({
      key: `${String(Date.now())}-${String(position)}`,
      name: nameOf(source),
      source,
      state: 'waiting',
      password: '',
      accountId: '',
    }));
    setItems((current) => [...current, ...created]);
    for (const item of created) {
      await run(item, { rememberPassword });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && initialSources.length > 0 && items.length === 0) {
          void start(initialSources);
        }
        if (!next) {
          setItems([]);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import statements</DialogTitle>
          <DialogDescription>
            Card and bank statements as PDF, Excel or CSV. Each one is checked against your ledger
            before anything changes.
          </DialogDescription>
        </DialogHeader>
        {initialSources.length === 0 ? (
          <Label className="hover:bg-muted/50 flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-6 text-sm">
            <FileUp className="size-6" />
            Choose statement files
            <input
              accept=".pdf,.xlsx,.xls,.csv,application/pdf"
              className="hidden"
              multiple
              type="file"
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = '';
                void start(files.map((file) => ({ kind: 'file', file })));
              }}
            />
          </Label>
        ) : null}
        <label className="flex items-center gap-2 text-sm" htmlFor={rememberId}>
          <Checkbox
            checked={rememberPassword}
            id={rememberId}
            onCheckedChange={(checked) => {
              setRememberPassword(checked === true);
            }}
          />
          Remember passwords for these cards (stored encrypted)
        </label>
        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {items.map((item) => (
            <ItemRow
              key={item.key}
              accounts={accounts}
              item={item}
              onChange={(change) => {
                patch(item.key, change);
              }}
              onRetry={() => {
                void run(item, {
                  rememberPassword,
                  password: item.password === '' ? undefined : item.password,
                  accountId: item.accountId === '' ? undefined : item.accountId,
                });
              }}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
