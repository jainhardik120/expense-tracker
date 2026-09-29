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
              <PortalEventBoundary>{action}</PortalEventBoundary>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

/**
 * Keeps a dialog's events from bubbling back into the menu that opened it.
 *
 * The menu stays open so the action it holds is never unmounted, which means a
 * dialog opened from here is still a React child of the menu item -- portalled
 * out of the menu's DOM, but not out of its tree. React bubbles events along
 * the tree rather than the DOM, so every keystroke and click inside the dialog
 * arrived back at the menu, which read them as interactions with itself: the
 * space bar became typeahead and was swallowed before the field could see it,
 * and a click in a field was taken for a click on the menu item.
 *
 * Only events from outside this element's own DOM are stopped. Anything the
 * trigger itself raises still reaches the menu, so arrow keys and Enter go on
 * working.
 */
const PortalEventBoundary = ({ children }: { children: ReactNode }) => {
  const stopIfPortalled = (event: React.SyntheticEvent) => {
    if (!(event.currentTarget as Node).contains(event.target as Node)) {
      event.stopPropagation();
    }
  };
  return (
    // Not an interactive element: these handlers only decline events that were
    // never meant for the menu. Giving it a role or a tab stop would put a
    // control in the tree that does nothing when you reach it.
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
