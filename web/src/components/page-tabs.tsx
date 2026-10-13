'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type PageTab = { href: string; label: string; count?: number };

export const PageTabs = ({ tabs }: { tabs: PageTab[] }) => {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto overflow-y-hidden border-b">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        const count = tab.count ?? 0;
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
            {count > 0 ? (
              <Badge className="h-5 min-w-5 px-1.5" variant={active ? 'default' : 'secondary'}>
                {count}
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
};
