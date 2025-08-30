import type * as React from 'react';

import Link from 'next/link';

import { File } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

const links = [
  {
    label: 'Dashboard',
    href: '/',
  },
  {
    label: 'Accounts',
    href: '/accounts',
  },
  {
    label: 'Statements',
    href: '/statements',
  },
  {
    label: 'Friends',
    href: '/friends',
  },
];

export const AppSidebar = ({ ...props }: React.ComponentProps<typeof Sidebar>) => (
  <Sidebar {...props}>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {links.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild>
                  <Link href={item.href}>
                    <File />
                    {item.label}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarRail />
  </Sidebar>
);
