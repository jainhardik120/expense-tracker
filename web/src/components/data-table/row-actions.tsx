'use client';

import { Children, isValidElement, type ReactNode } from 'react';

import { MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export const RowActions = ({
  children,
  collapse = 'auto',
}: {
  children: ReactNode;
  collapse?: 'auto' | 'always';
}) => {
  const actions = Children.toArray(children).filter(isValidElement);

  if (actions.length === 0) {
    return null;
  }

  if (actions.length === 1 && collapse === 'auto') {
    return <div className="flex justify-end">{actions}</div>;
  }

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Row actions" className="size-8" size="icon" variant="ghost">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.key}
              className="p-0 focus:bg-transparent"
              onSelect={(event) => {
                event.preventDefault();
              }}
            >
              <PortalEventBoundary>{action}</PortalEventBoundary>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

const PortalEventBoundary = ({ children }: { children: ReactNode }) => {
  const stopIfPortalled = (event: React.SyntheticEvent) => {
    if (!(event.currentTarget as Node).contains(event.target as Node)) {
      event.stopPropagation();
    }
  };
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="w-full"
      onClick={stopIfPortalled}
      onKeyDown={stopIfPortalled}
      onKeyUp={stopIfPortalled}
      onPointerDown={stopIfPortalled}
      onPointerMove={stopIfPortalled}
      onPointerUp={stopIfPortalled}
    >
      {children}
    </div>
  );
};

export const RowActionTrigger = ({
  icon: Icon,
  label,
  destructive = false,
  className,
  ...props
}: React.ComponentProps<'button'> & {
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  label: string;
  destructive?: boolean;
}) => (
  <button
    className={cn(
      'hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none',
      destructive && 'text-destructive hover:text-destructive',
      className,
    )}
    type="button"
    {...props}
  >
    <Icon className="size-4 shrink-0" />
    {label}
  </button>
);
