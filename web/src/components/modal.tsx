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

const Modal = ({
  open,
  setOpen,
  trigger,
  title,
  children,
  description,
  className,
}: {
  open: boolean;
  setOpen: React.Dispatch<boolean>;
  trigger: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="p-4 pb-8">
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
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
