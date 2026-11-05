'use client';

import { type ReactNode, useState } from 'react';

import { type DialogControl } from '@/components/modal';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

export type RowMenuAction = {
  key: string;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  destructive?: boolean;
  dialog: (control: DialogControl) => ReactNode;
};

export const RowContextMenu = ({
  actions,
  children,
}: {
  actions: RowMenuAction[];
  children: React.ReactElement;
}) => {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = actions.find((action) => action.key === activeKey);
  return (
    <>
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {actions.map(({ key, label, icon: Icon, destructive = false }) => (
            <ContextMenuItem
              key={key}
              variant={destructive ? 'destructive' : 'default'}
              onSelect={() => {
                setActiveKey(key);
              }}
            >
              <Icon />
              {label}
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      </ContextMenu>
      {active?.dialog({
        open: true,
        onOpenChange: (open) => {
          if (!open) {
            setActiveKey(null);
          }
        },
      })}
    </>
  );
};
