'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ArrowRight, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatCurrency } from '@/lib/format';
import { cn, errorMessage } from '@/lib/utils';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

import { AdditionEditor, type Decision } from './addition-editor';

import { ImportStatusBadge } from '../../../_components/import-status-badge';
import {
  formatDay,
  formatPeriod,
  cleanDescription,
  formatShortDay,
  issuerLabel,
  signedCurrency,
} from '../../../_components/statement-labels';

type Review = RouterOutput['statementImports']['getReview'];
type Suggestion = Review['suggestions'][number];
type Addition = Extract<Suggestion, { type: 'add' | 'add_difference' }>;
type LedgerRow = NonNullable<Review['ledger'][string]>;
type Group = Review['groups'][number];

const PAISE = 100;

const signed = (amount: number, direction: 'debit' | 'credit') =>
  direction === 'debit' ? -amount : amount;

const toPaise = (value: number) => Math.round(value * PAISE);

const GROUP_LABELS: Record<Group['kind'], string> = {
  exact: 'Same row',
  ledger_club: 'You clubbed these',
  statement_club: 'You split this',
  window: 'Netted over a few days',
  reversal: 'Charged and reversed',
  near: 'Amount differs',
  emi_rounding: 'EMI, off by paise',
};

const isAddition = (suggestion: Suggestion): suggestion is Addition =>
  suggestion.type === 'add' || suggestion.type === 'add_difference';

const initialDecisions = (review: Review): Partial<Record<string, Decision>> =>
  Object.fromEntries(
    review.suggestions.map((suggestion): [string, Decision] => [
      suggestion.id,
      {
        accepted: suggestion.type !== 'redate' && suggestion.type !== 'not_on_statement',
        mode: isAddition(suggestion) && suggestion.foldInto !== null ? 'fold' : 'new',
        statementKind: isAddition(suggestion) ? suggestion.defaults.statementKind : 'expense',
        category: isAddition(suggestion) ? suggestion.defaults.category : '',
        tags: isAddition(suggestion) ? suggestion.defaults.tags : [],
        counterpartyAccountId: isAddition(suggestion)
          ? suggestion.defaults.counterpartyAccountId
          : null,
      },
    ]),
  );

const effectOf = (suggestion: Suggestion, ledger: Review['ledger'], periodEnd: string) => {
  if (isAddition(suggestion)) {
    return toPaise(signed(suggestion.amount, suggestion.direction));
  }
  if (suggestion.type === 'adjust') {
    const row = ledger[suggestion.ledger];
    return row === undefined
      ? 0
      : toPaise(signed(suggestion.to, row.direction)) -
          toPaise(signed(suggestion.from, row.direction));
  }
  if (suggestion.type === 'redate') {
    const row = ledger[suggestion.ledger];
    return row !== undefined && row.date > periodEnd && suggestion.to <= periodEnd
      ? toPaise(signed(row.amount, row.direction))
      : 0;
  }
  return 0;
};

const Amount = ({ value, direction }: { value: number; direction: 'debit' | 'credit' }) => (
  <span
    className={cn(
      'tabular-nums',
      direction === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : undefined,
    )}
  >
    {direction === 'credit' ? '+' : ''}
    {formatCurrency(value)}
  </span>
);

const LedgerLabel = ({ row }: { row: LedgerRow | undefined }) =>
  row === undefined ? (
    <span className="text-muted-foreground">Unknown row</span>
  ) : (
    <span>
      {row.label}
      <span className="text-muted-foreground"> · {formatShortDay(row.date)}</span>
    </span>
  );

const Section = ({
  title,
  description,
  children,
  count,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  count: number;
}) =>
  count === 0 ? null : (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          <Badge variant="secondary">{count}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  );

const BalancePanel = ({
  review,
  closingAfter,
  remaining,
}: {
  review: Review;
  closingAfter: number;
  remaining: Array<{ label: string; amount: number }>;
}) => {
  const { balance } = review;
  const statementMovement =
    balance.statementOpening === null || balance.statementClosing === null
      ? null
      : toPaise(balance.statementClosing) - toPaise(balance.statementOpening);
  const ledgerMovement = closingAfter - toPaise(balance.appOpening);
  const gap = statementMovement === null ? null : ledgerMovement - statementMovement;
  const openingGap =
    balance.statementOpening === null
      ? null
      : toPaise(balance.appOpening) - toPaise(balance.statementOpening);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {gap === 0 ? (
            <CircleCheck className="size-5 text-emerald-600" />
          ) : (
            <TriangleAlert className="size-5 text-amber-600" />
          )}
          {gap === 0
            ? 'This period matches the bank to the paise'
            : `This period is off by ${signedCurrency((gap ?? 0) / PAISE)}`}
        </CardTitle>
        <CardDescription>
          Balances as the app shows them for this account, so money owed on a card is negative.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Bank statement</span>
          <span className="flex items-center gap-2 tabular-nums">
            {balance.statementOpening === null ? '-' : formatCurrency(balance.statementOpening)}
            <ArrowRight className="size-3" />
            {balance.statementClosing === null ? '-' : formatCurrency(balance.statementClosing)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Your ledger, after the selected changes</span>
          <span className="flex items-center gap-2 tabular-nums">
            {formatCurrency(balance.appOpening)}
            <ArrowRight className="size-3" />
            {formatCurrency(closingAfter / PAISE)}
            {toPaise(balance.appClosing) === closingAfter ? null : (
              <span className="text-muted-foreground">
                (now {formatCurrency(balance.appClosing)})
              </span>
            )}
          </span>
        </div>
        {openingGap === null || openingGap === 0 ? null : (
          <p className="text-muted-foreground md:col-span-2">
            Before this period your ledger was already {formatCurrency(openingGap / PAISE)} away
            from the bank. That comes from earlier statements, not this one.
          </p>
        )}
        {gap === null || gap === 0 ? null : (
          <div className="flex flex-col gap-1 md:col-span-2">
            <span className="text-muted-foreground">What is still different</span>
            {[
              ...remaining,
              {
                label: 'Something else (check older rows)',
                amount: gap - remaining.reduce((sum, entry) => sum + entry.amount, 0),
              },
            ]
              .filter((entry) => entry.amount !== 0)
              .map((entry) => (
                <span key={entry.label} className="flex justify-between gap-2">
                  <span>{entry.label}</span>
                  <span className="tabular-nums">{formatCurrency(entry.amount / PAISE)}</span>
                </span>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const MatchedGroups = ({ review }: { review: Review }) => {
  const [open, setOpen] = useState(false);
  if (review.groups.length === 0) {
    return null;
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="flex items-center gap-2">
              Already in your ledger
              <Badge variant="secondary">{review.groups.length}</Badge>
            </CardTitle>
            <CardDescription>
              Statement rows that match rows you already have, including ones you clubbed together
              or spread over a few days.
            </CardDescription>
          </div>
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="outline">
              {open ? 'Hide' : 'Show'}
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-2">
            {review.groups.map((group) => (
              <div
                key={`${group.rows.join('-')}|${group.ledger.join('-')}`}
                className="grid gap-2 rounded-md border p-2 text-sm md:grid-cols-[1fr_auto_1fr]"
              >
                <div className="flex flex-col gap-0.5">
                  {group.rows.map((index) => {
                    const row = review.rows.at(index);
                    return row === undefined ? null : (
                      <span key={index} className="flex justify-between gap-2">
                        <span className="truncate">
                          <span className="text-muted-foreground">{formatShortDay(row.date)} </span>
                          {cleanDescription(row.description)}
                        </span>
                        <Amount direction={row.direction} value={row.amount} />
                      </span>
                    );
                  })}
                </div>
                <Badge className="self-center" variant="outline">
                  {GROUP_LABELS[group.kind]}
                </Badge>
                <div className="flex flex-col gap-0.5">
                  {group.ledger.map((key) => {
                    const row = review.ledger[key];
                    return (
                      <span key={key} className="flex justify-between gap-2">
                        <LedgerLabel row={row} />
                        {row === undefined ? null : (
                          <Amount direction={row.direction} value={row.amount} />
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

const AcceptBox = ({
  checked,
  disabled,
  id,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  id?: string;
  onChange: (checked: boolean) => void;
}) => (
  <Checkbox
    checked={checked}
    className="mt-0.5"
    disabled={disabled}
    id={id}
    onCheckedChange={(value) => {
      onChange(value === true);
    }}
  />
);

export const ImportReview = ({
  review,
  accounts,
  categories,
}: {
  review: Review;
  accounts: Array<{ id: string; accountName: string }>;
  categories: string[];
}) => {
  const router = useRouter();
  const [decisions, setDecisions] = useState(() => initialDecisions(review));
  const apply = api.statementImports.applyChanges.useMutation();
  const editable = review.import.status === 'review' && review.blockedBy === null;

  const update = (id: string, change: Partial<Decision>) => {
    setDecisions((current) => {
      const existing = current[id];
      return existing === undefined ? current : { ...current, [id]: { ...existing, ...change } };
    });
  };

  const additions = review.suggestions.filter(isAddition);
  const adjustments = review.suggestions.filter(
    (suggestion): suggestion is Extract<Suggestion, { type: 'adjust' }> =>
      suggestion.type === 'adjust',
  );
  const redates = review.suggestions.filter(
    (suggestion): suggestion is Extract<Suggestion, { type: 'redate' }> =>
      suggestion.type === 'redate',
  );
  const extras = review.suggestions.filter(
    (suggestion): suggestion is Extract<Suggestion, { type: 'not_on_statement' }> =>
      suggestion.type === 'not_on_statement',
  );

  const { closingAfter, remaining, acceptedCount } = useMemo(() => {
    let closing = toPaise(review.balance.appClosing);
    let count = 0;
    let unselected = 0;
    let redated = 0;
    let billedLater = 0;
    let nextStatement = 0;
    for (const suggestion of review.suggestions) {
      if (suggestion.type === 'not_on_statement') {
        const row = review.ledger[suggestion.ledger];
        const value = row === undefined ? 0 : toPaise(signed(row.amount, row.direction));
        if (suggestion.matchedOn !== null) {
          billedLater += value;
        } else if (suggestion.likelyNext) {
          nextStatement += value;
        }
      }
      const effect = effectOf(suggestion, review.ledger, review.import.periodEnd);
      const accepted = decisions[suggestion.id]?.accepted === true;
      if (accepted) {
        closing += effect;
        count += 1;
      }
      if (suggestion.type === 'redate') {
        redated += accepted ? effect : 0;
      } else if (!accepted) {
        unselected -= effect;
      }
    }
    const entries = [
      {
        label: 'In your ledger but not on this statement',
        amount: toPaise(review.periodGap.notOnStatement) - billedLater - nextStatement,
      },
      { label: 'Matched on another statement', amount: billedLater },
      { label: 'Probably on the next statement', amount: nextStatement },
      {
        label: 'Already matched to another statement',
        amount: toPaise(review.periodGap.countedElsewhere),
      },
      {
        label: 'Matched, but dated outside this period',
        amount: toPaise(review.periodGap.datedOutside) + redated,
      },
      { label: 'Changes you have not selected', amount: unselected },
    ];
    return {
      closingAfter: closing,
      remaining: entries.filter((entry) => entry.amount !== 0),
      acceptedCount: count,
    };
  }, [decisions, review]);

  const submit = () => {
    apply.mutate(
      {
        id: review.import.id,
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
  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            {issuerLabel(info.issuer)} · {info.accountName}
            <ImportStatusBadge status={info.status} />
          </h3>
          <span className="text-muted-foreground text-sm">
            {formatPeriod(info.periodStart, info.periodEnd)} · {review.rows.length} rows
            {info.totalDue === null ? '' : ` · ${totalLabel} ${formatCurrency(info.totalDue)}`}
            {info.summary.dueDate === null ? '' : ` by ${formatDay(info.summary.dueDate)}`}
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/inbox/statements">All statements</Link>
        </Button>
      </div>

      {review.blockedBy === null ? null : (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <Info className="size-4" />
            An earlier statement for this account is still waiting. Apply it first so the same rows
            are not counted twice.
          </span>
          <Button asChild size="sm" variant="outline">
            <Link href={`/inbox/statements/${review.blockedBy.id}`}>
              Open the one ending {formatShortDay(review.blockedBy.periodEnd)}
            </Link>
          </Button>
        </div>
      )}

      {info.summary.declared !== null &&
      (toPaise(info.summary.declared.debits) !== toPaise(info.summary.totals.debits) ||
        toPaise(info.summary.declared.credits) !== toPaise(info.summary.totals.credits)) ? (
        <div className="border-destructive/40 bg-destructive/5 rounded-md border px-4 py-3 text-sm">
          The rows read from this PDF do not add up to the totals printed on it, so some rows may be
          missing. Check the suggestions carefully.
        </div>
      ) : null}

      <BalancePanel closingAfter={closingAfter} remaining={remaining} review={review} />

      <Section
        count={additions.length}
        description="On the statement but not in your ledger. Pick how each one should be saved, or fold small charges into the row they came with."
        title="Missing from your ledger"
      >
        {additions.map((suggestion) => {
          const decision = decisions[suggestion.id];
          return decision === undefined ? null : (
            <AdditionEditor
              key={suggestion.id}
              accountId={info.accountId}
              accounts={accounts}
              categories={categories}
              decision={decision}
              disabled={!editable}
              foldTarget={
                suggestion.foldInto === null ? undefined : review.ledger[suggestion.foldInto]
              }
              suggestion={suggestion}
              onChange={(change) => {
                update(suggestion.id, change);
              }}
            />
          );
        })}
      </Section>

      <Section
        count={adjustments.length}
        description="Rows in your ledger whose amount is different from what the bank charged."
        title="Amounts to correct"
      >
        {adjustments.map((suggestion) => {
          const row = review.ledger[suggestion.ledger];
          const group = review.groups.at(suggestion.group);
          return (
            <label
              key={suggestion.id}
              className="flex items-start gap-3 rounded-md border p-3 text-sm"
            >
              <AcceptBox
                checked={decisions[suggestion.id]?.accepted === true}
                disabled={!editable}
                onChange={(accepted) => {
                  update(suggestion.id, { accepted });
                }}
              />
              <div className="flex flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <LedgerLabel row={row} />
                  <span className="flex items-center gap-2 tabular-nums">
                    <span className="text-muted-foreground line-through">
                      {formatCurrency(suggestion.from)}
                    </span>
                    <ArrowRight className="size-3" />
                    <span className="font-medium">{formatCurrency(suggestion.to)}</span>
                  </span>
                </span>
                {group === undefined ? null : (
                  <span className="text-muted-foreground text-xs">
                    Bank:{' '}
                    {group.rows
                      .map((index) => cleanDescription(review.rows.at(index)?.description ?? ''))
                      .join(' + ')}
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </Section>

      <Section
        count={redates.length}
        description="These match the statement but you dated them outside its period. Moving them keeps each statement's rows inside its own period. Optional."
        title="Dates outside the statement"
      >
        {redates.map((suggestion) => (
          <label
            key={suggestion.id}
            className="flex items-start gap-3 rounded-md border p-3 text-sm"
            htmlFor={`accept-${suggestion.id}`}
          >
            <AcceptBox
              checked={decisions[suggestion.id]?.accepted === true}
              disabled={!editable}
              id={`accept-${suggestion.id}`}
              onChange={(accepted) => {
                update(suggestion.id, { accepted });
              }}
            />
            <span className="flex flex-1 flex-wrap items-center justify-between gap-2">
              <LedgerLabel row={review.ledger[suggestion.ledger]} />
              <span className="flex items-center gap-2">
                {formatShortDay(suggestion.from)}
                <ArrowRight className="size-3" />
                {formatShortDay(suggestion.to)}
              </span>
            </span>
          </label>
        ))}
      </Section>

      <Section
        count={extras.length}
        description="Dated inside this period but the bank never charged them. They may belong to another account, or show up on the next statement. Nothing is changed for these."
        title="Not on the statement"
      >
        {extras.map((suggestion) => {
          const row = review.ledger[suggestion.ledger];
          return (
            <div
              key={suggestion.id}
              className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <span className="flex flex-wrap items-center gap-2">
                <LedgerLabel row={row} />
                {suggestion.matchedOn === null ? null : (
                  <Link href={`/inbox/statements/${suggestion.matchedOn.id}`}>
                    <Badge variant="secondary">
                      Matched on the statement ending{' '}
                      {formatShortDay(suggestion.matchedOn.periodEnd)}
                    </Badge>
                  </Link>
                )}
                {suggestion.matchedOn === null && suggestion.likelyNext ? (
                  <Badge variant="outline">Probably on the next statement</Badge>
                ) : null}
              </span>
              {row === undefined ? null : <Amount direction={row.direction} value={row.amount} />}
            </div>
          );
        })}
      </Section>

      <MatchedGroups review={review} />

      {editable ? (
        <div className="bg-background/95 sticky bottom-0 flex items-center justify-between gap-2 border-t py-3">
          <span className="text-muted-foreground text-sm">
            {acceptedCount === 0
              ? 'Nothing selected. Applying marks this statement as checked.'
              : `${String(acceptedCount)} changes selected.`}
          </span>
          <Button disabled={apply.isPending} onClick={submit}>
            {acceptedCount === 0 ? 'Mark as checked' : `Apply ${String(acceptedCount)} changes`}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
