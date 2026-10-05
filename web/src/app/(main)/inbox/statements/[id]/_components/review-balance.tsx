'use client';

import { ArrowRight, CircleCheck, TriangleAlert } from 'lucide-react';

import { formatCurrency } from '@/lib/format';

import { type Decisions, effectOf, fromPaise, type Review, signed, toPaise } from './review-model';

import { signedCurrency } from '../../../_components/statement-labels';

type Remaining = { label: string; amount: number; explained: boolean };

export const balanceAfter = (review: Review, decisions: Decisions) => {
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
  const remaining: Remaining[] = [
    {
      label: 'not on this statement',
      amount: toPaise(review.periodGap.notOnStatement) - billedLater - nextStatement,
      explained: false,
    },
    { label: 'on another statement', amount: billedLater, explained: true },
    { label: 'likely on the next statement', amount: nextStatement, explained: true },
    {
      label: 'already matched to another statement',
      amount: toPaise(review.periodGap.countedElsewhere),
      explained: true,
    },
    {
      label: 'dated outside this period',
      amount: toPaise(review.periodGap.datedOutside) + redated,
      explained: true,
    },
    { label: 'changes not selected', amount: unselected, explained: false },
  ].filter((entry) => entry.amount !== 0);
  return { closingAfter: closing, remaining, acceptedCount: count };
};

const headline = (matches: boolean, rowsMatch: boolean, gap: number | null) => {
  if (matches) {
    return 'Matches the bank to the paise';
  }
  if (rowsMatch) {
    return 'This statement matches, but your ledger starts off';
  }
  return `Off by ${signedCurrency(fromPaise(gap ?? 0))}`;
};

export const BalanceStrip = ({
  review,
  closingAfter,
  remaining,
}: {
  review: Review;
  closingAfter: number;
  remaining: Remaining[];
}) => {
  const { balance } = review;
  const statementMovement =
    balance.statementOpening === null || balance.statementClosing === null
      ? null
      : toPaise(balance.statementClosing) - toPaise(balance.statementOpening);
  const gap =
    statementMovement === null
      ? null
      : closingAfter - toPaise(balance.appOpening) - statementMovement;
  const accounted = remaining.reduce((sum, entry) => sum + entry.amount, 0);
  const breakdown =
    gap === null || gap === 0
      ? []
      : [
          ...remaining,
          { label: 'something else', amount: gap - accounted, explained: false },
        ].filter((entry) => entry.amount !== 0);
  const rowsMatch = gap === 0 || (gap !== null && breakdown.every((entry) => entry.explained));
  const matches = rowsMatch && review.blockedBy === null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border px-4 py-3 text-sm">
      <span className="flex items-center gap-2 font-medium">
        {matches ? (
          <CircleCheck className="size-4 text-emerald-600" />
        ) : (
          <TriangleAlert className="size-4 text-amber-600" />
        )}
        {headline(matches, rowsMatch, gap)}
      </span>
      <span className="flex items-center gap-1.5 tabular-nums">
        <span className="text-muted-foreground">Bank</span>
        {balance.statementOpening === null ? '-' : formatCurrency(balance.statementOpening)}
        <ArrowRight className="size-3" />
        {balance.statementClosing === null ? '-' : formatCurrency(balance.statementClosing)}
      </span>
      <span className="flex items-center gap-1.5 tabular-nums">
        <span className="text-muted-foreground">Ledger after changes</span>
        {formatCurrency(balance.appOpening)}
        <ArrowRight className="size-3" />
        {formatCurrency(fromPaise(closingAfter))}
      </span>
      {breakdown.length === 0 ? null : (
        <span className="text-muted-foreground">
          {breakdown
            .map((entry) => `${signedCurrency(fromPaise(entry.amount))} ${entry.label}`)
            .join(' · ')}
        </span>
      )}
    </div>
  );
};
