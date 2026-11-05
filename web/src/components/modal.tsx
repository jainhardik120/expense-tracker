'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export type DialogControl = { open: boolean; onOpenChange: (open: boolean) => void };

const Modal = ({
  open,
  setOpen,
  trigger,
  title,
  children,
  description,
  className,
  drawerClassName,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  trigger?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  drawerClassName?: string;
}) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        {trigger === undefined ? null : <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
        <DrawerContent className={cn('p-4 pb-8', drawerClassName)}>
          {title === undefined && description === undefined ? null : (
            <DrawerHeader className="text-left">
              {title === undefined ? null : <DrawerTitle>{title}</DrawerTitle>}
              {description === undefined ? null : (
                <DrawerDescription>{description}</DrawerDescription>
              )}
            </DrawerHeader>
          )}
          {children}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === undefined ? null : <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={cn('sm:max-w-106.25', className)}>
        {title === undefined && description === undefined ? null : (
          <DialogHeader>
            {title === undefined ? null : <DialogTitle>{title}</DialogTitle>}
            {description === undefined ? null : (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
};

export default Modal;
