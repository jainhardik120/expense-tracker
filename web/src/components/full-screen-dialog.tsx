'use client';

import type * as React from 'react';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Maximize2Icon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const FullScreenDialog = ({
  open,
  setOpen,
  trigger,
  title,
  description,
  actions,
  children,
  className,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <Dialog open={open} onOpenChange={setOpen}>
    {trigger === undefined ? null : <DialogTrigger asChild>{trigger}</DialogTrigger>}
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="bg-background fixed inset-0 z-50" />
      <DialogPrimitive.Content
        className="bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:zoom-out-[0.98] fixed inset-0 z-50 flex flex-col duration-200 focus:outline-none"
        data-slot="full-screen-dialog"
        {...(description === undefined ? { 'aria-describedby': undefined } : {})}
      >
        <header className="flex items-center gap-3 border-b px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="truncate">{title}</DialogTitle>
            {description === undefined ? null : (
              <DialogDescription>{description}</DialogDescription>
            )}
          </div>
          {actions}
          <DialogPrimitive.Close asChild>
            <Button aria-label="Close" className="-mr-2 shrink-0" size="icon" variant="ghost">
              <XIcon />
            </Button>
          </DialogPrimitive.Close>
        </header>
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6',
            className,
          )}
        >
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </Dialog>
);

export const ExpandButton = ({
  className,
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) => (
  <Button
    aria-label="Expand to full screen"
    className={cn('size-8', className)}
    size="icon"
    variant="ghost"
    onClick={onClick}
  >
    <Maximize2Icon />
  </Button>
);

export default FullScreenDialog;
