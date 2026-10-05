'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type RouterOutput } from '@/server/routers';

type Overview = RouterOutput['statementImports']['getOverview'];

const tabs = (overview: Overview) => [
  { href: '/inbox/sms', label: 'SMS', count: overview.pendingSms },
  { href: '/inbox/statements', label: 'Statements', count: overview.statementsToReview },
  { href: '/inbox/balances', label: 'Balances', count: overview.balanceMismatches },
  { href: '/inbox/email', label: 'Email', count: overview.emailsNotImported },
];

export const InboxTabs = ({ overview }: { overview: Overview }) => {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto overflow-y-hidden border-b">
      {tabs(overview).map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
              active
                ? 'border-primary text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
            href={tab.href}
            prefetch={false}
          >
            {tab.label}
            {tab.count > 0 ? (
              <Badge className="h-5 min-w-5 px-1.5" variant={active ? 'default' : 'secondary'}>
                {tab.count}
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
};
