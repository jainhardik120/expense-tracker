'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { CreditCard, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { issuerLabel } from '../../_components/statement-labels';

type Sources = RouterOutput['statementImports']['listSources'];

const SavePassword = ({ accountId }: { accountId: string }) => {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const save = api.statementImports.savePassword.useMutation();
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(
          { accountId, password },
          {
            onSuccess: () => {
              toast.success('Password saved');
              setPassword('');
              router.refresh();
            },
            onError: (error) => toast.error(errorMessage(error)),
          },
        );
      }}
    >
      <Input
        autoComplete="off"
        className="h-8 w-40"
        placeholder="Statement password"
        type="password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />
      <Button disabled={save.isPending || password.trim() === ''} size="sm" type="submit">
        Save
      </Button>
    </form>
  );
};

const SavePasswordOrNote = ({ source }: { source: Sources[number] }) =>
  source.issuer === 'sheet' ? (
    <span className="text-muted-foreground text-xs">Spreadsheets need no password</span>
  ) : (
    <SavePassword accountId={source.accountId} />
  );

export const RecognisedCards = ({ sources }: { sources: Sources }) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const forget = api.statementImports.forgetPassword.useMutation();
  return (
    <Modal
      className="sm:max-w-xl"
      description="Statements from these cards are matched to the account automatically, including PDFs that arrive by email. Save each card's PDF password so emailed statements open on their own. Saved passwords are encrypted and only used to open your statements."
      open={open}
      setOpen={setOpen}
      title="Recognised cards"
      trigger={
        <Button className="h-8" variant="outline">
          <CreditCard className="size-4" />
          Recognised cards
        </Button>
      }
    >
      {sources.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Cards appear here after you import their first statement.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sources.map((source) => (
            <div
              key={source.accountId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <span>
                {source.accountName} · {issuerLabel(source.issuer)}
                {source.cardLast4 === null ? '' : ` ending ${source.cardLast4}`}
              </span>
              {source.hasPassword ? (
                <Button
                  disabled={forget.isPending}
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    forget.mutate(
                      { accountId: source.accountId },
                      {
                        onSuccess: () => {
                          toast.success('Password forgotten');
                          router.refresh();
                        },
                        onError: (error) => toast.error(errorMessage(error)),
                      },
                    );
                  }}
                >
                  <KeyRound className="size-4" />
                  Forget password
                </Button>
              ) : (
                <SavePasswordOrNote source={source} />
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};
