import Link from 'next/link';

import { Home, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const StatusPage = ({
  icon: Icon,
  tone,
  code,
  title,
  children,
}: {
  icon: LucideIcon;
  tone: 'destructive' | 'muted';
  code: string;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
    <div className="flex flex-col items-center space-y-6 text-center">
      <div
        className={cn(
          'rounded-full p-6',
          tone === 'destructive' ? 'bg-destructive/10' : 'bg-muted',
        )}
      >
        <Icon
          className={cn(
            'size-16',
            tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground',
          )}
          strokeWidth={1.5}
        />
      </div>
      <h1 className="text-foreground text-7xl font-bold tracking-tighter">{code}</h1>
      <h2 className="text-foreground text-2xl font-semibold">{title}</h2>
      <p className="text-muted-foreground max-w-md">{children}</p>
      <div className="flex flex-col gap-3 pt-4 sm:flex-row">
        <Button asChild variant="default">
          <Link href="/">
            <Home />
            Go to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  </div>
);
