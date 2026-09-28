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

/**
 * The actions available on a row, behind a single button once there is more
 * than one of them.
 *
 * A row of four icons is four things to recognise before you can pick one, and
 * it crowds out the data the row exists to show. A lone action stays where it
 * is: hiding one thing behind a menu is a click for nothing.
 */
export const RowActions = ({
  children,
  collapse = 'auto',
}: {
  children: ReactNode;
  /**
   * `auto` leaves a lone action where it is; `always` puts it behind the menu
   * regardless. Use `always` where a table sits beside others that do have
   * several actions, so every row in the group carries the same control.
   */
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
              // Children.toArray assigns a stable key by position, which is the
              // right identity here: a fixed list per row, never reordered.
              key={action.key}
              className="p-0 focus:bg-transparent"
              // Each action owns the dialog it opens, and closing the menu would
              // unmount the action -- taking the dialog with it before it could
              // appear. So the menu is told to stay put.
              onSelect={(event) => {
                event.preventDefault();
              }}
            >
              {action}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

/**
 * The trigger an action renders when it sits inside the menu: a full width row
 * reading as a label rather than an icon to be decoded.
 */
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
