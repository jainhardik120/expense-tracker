import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { CookiesProvider } from 'next-client-cookies/server';

import { AppSidebar } from '@/components/app-sidebar';
import ThemeToggle from '@/components/theme-toggle';
import TimeZoneSetter from '@/components/time-zone-setter';
import { Separator } from '@/components/ui/separator';
import {
  SIDEBAR_COOKIE_NAME,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { auth } from '@/lib/auth';

import AdminSession from './_components/admin-session';
import FloatingChatbot from './_components/floating-chatbot';
import UserButton from './_components/user-button';

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session === null) {
    return redirect('/403');
  }
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === 'true';

  return (
    <CookiesProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <SidebarInset>
          <header className="bg-background sticky top-0 z-9 flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
            <div className="flex w-full items-center justify-between gap-2">
              <h1 className="text-lg font-bold">Expense Tracker</h1>
              <div className="flex items-center gap-2">
                <AdminSession session={session} />
                <ThemeToggle />
                <UserButton session={session} />
              </div>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
          <FloatingChatbot />
        </SidebarInset>
      </SidebarProvider>
      <TimeZoneSetter />
    </CookiesProvider>
  );
}
