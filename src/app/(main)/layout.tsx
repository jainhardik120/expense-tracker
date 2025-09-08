import { cookies } from 'next/headers';

import { AppSidebar } from '@/components/app-sidebar';
import ThemeToggle from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

import UserButton from './_components/UserButton';

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        <header className="bg-background sticky top-0 z-[40] flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
          <div className="flex w-full items-center justify-between gap-2">
            <h1 className="text-lg font-bold">Expense Tracker</h1>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <UserButton />
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
