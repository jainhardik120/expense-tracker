import { headers } from 'next/headers';
import Link from 'next/link';

import { Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth';

import { Reconciliation } from './_components/reconciliation';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Expense Tracker',
  description:
    'A ledger for every account, card, loan and investment you have, checked against what the bank says.',
};

const TRACKS = [
  {
    question: 'Money in and out',
    answer: 'Statements, bank SMS capture, friend splits',
  },
  {
    question: 'What you owe',
    answer: 'EMI schedules, recurring payments, card bills',
  },
  {
    question: 'What you own',
    answer: 'Fixed deposits, stocks, mutual funds, RSUs, EPFO',
  },
  {
    question: "What's left to spend",
    answer: 'Budget lines, pay cycles, safe-to-spend',
  },
];

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const signedIn = session !== null;

  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="border-border/60 border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <Link
            className="focus-visible:ring-ring flex items-center gap-2.5 rounded-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            href="/home"
          >
            <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <Wallet className="size-3.5" />
            </span>
            Expense Tracker
          </Link>
          <Button asChild size="sm" variant={signedIn ? 'default' : 'outline'}>
            <Link href={signedIn ? '/' : '/auth/login'}>
              {signedIn ? 'Open dashboard' : 'Sign in'}
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-center lg:gap-16">
          <div className="flex flex-col justify-center">
            <h1 className="max-w-[18ch] text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl">
              It balances, or it tells you where it doesn&apos;t.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-[62ch] text-lg leading-8">
              A ledger for every account, card, loan and investment you have, checked against what
              the bank actually says. Down to the paisa.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href={signedIn ? '/' : '/auth/login'}>
                  {signedIn ? 'Open dashboard' : 'Sign in'}
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="#tracks">What it tracks</Link>
              </Button>
            </div>
          </div>
          <Reconciliation />
        </section>

        <section className="border-border/60 border-t py-14 sm:py-16" id="tracks">
          <h2 className="text-2xl font-semibold tracking-tight">What it keeps track of</h2>
          <dl className="mt-8 grid gap-x-12 gap-y-5">
            {TRACKS.map((track) => (
              <div
                key={track.question}
                className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4"
              >
                <dt className="font-medium whitespace-nowrap">{track.question}</dt>
                <span
                  aria-hidden
                  className="border-border/70 hidden flex-1 border-b border-dashed sm:block"
                />
                <dd className="text-muted-foreground sm:text-right">{track.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-border/60 grid gap-10 border-t py-14 sm:py-16 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Your bank already tells you</h2>
            <p className="text-muted-foreground mt-5 max-w-[60ch] leading-8">
              The Android app reads the alert your bank sends after a payment, works out what it was
              and who it was with, and holds it for you to confirm. Most of a month&apos;s spending
              ends up entered without typing it.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Loans are not guesswork</h2>
            <p className="text-muted-foreground mt-5 max-w-[60ch] leading-8">
              An EMI knows its own schedule: interest, GST, processing fee, and the instalment that
              falls due next. Split one with a friend and both sides of it stay on the books.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-border/60 border-t">
        <div className="text-muted-foreground mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>Expense Tracker</p>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link className="hover:text-foreground" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-foreground" href="/terms">
              Terms
            </Link>
            <Link className="hover:text-foreground" href="/support">
              Support
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
