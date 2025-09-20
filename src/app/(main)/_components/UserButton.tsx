'use client';

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
import { signOut, useSession } from '@/lib/auth-client';

const getUserInitials = (name: string) => {
  return name
    .toUpperCase()
    .split(' ')
    .map((n) => n[0])
    .join('');
};

const UserLabel = ({ user }: { user: Awaited<ReturnType<typeof useSession>> }) => {
  const { data: userData } = user;
  return (
    <Avatar className="h-8 w-8 rounded-lg grayscale">
      <AvatarImage alt={userData?.user.name} src={userData?.user.image ?? ''} />
      <AvatarFallback className="rounded-lg">
        {getUserInitials(userData?.user.name ?? '')}
      </AvatarFallback>
    </Avatar>
  );
};

const UserButton = () => {
  const user = useSession();
  const { data: userData } = user;
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <UserLabel user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
        side="bottom"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <UserLabel user={user} />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{userData?.user.name}</span>
              <span className="text-muted-foreground truncate text-xs">{userData?.user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
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
