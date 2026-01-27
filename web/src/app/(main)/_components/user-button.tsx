'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { LogOutIcon } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Session } from '@/lib/auth';
import { signOut } from '@/lib/auth-client';

const getUserInitials = (name: string) => {
  return name
    .toUpperCase()
    .split(' ')
    .map((n) => n[0])
    .join('');
};

const UserLabel = ({ session }: { session: Session }) => {
  const { user } = session;
  return (
    <Avatar className="h-8 w-8 rounded-lg grayscale">
      <AvatarImage alt={user.name} src={user.image ?? ''} />
      <AvatarFallback className="rounded-lg">{getUserInitials(user.name)}</AvatarFallback>
    </Avatar>
  );
};

const UserButton = ({ session }: { session: Session }) => {
  const { user } = session;
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <UserLabel session={session} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
        side="bottom"
        sideOffset={4}
      >
        <Link href="/account">
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <UserLabel session={session} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">{user.email}</span>
              </div>
            </div>
          </DropdownMenuLabel>
        </Link>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            signOut().then(() => {
              router.refresh();
              return true;
            })
          }
        >
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserButton;
