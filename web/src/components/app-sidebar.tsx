'use client';

import type * as React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  CreditCard,
  DollarSign,
  LineChart,
  Sheet,
  FileBarChart,
  Banknote,
  Inbox,
  Target,
} from 'lucide-react';

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
    icon: LineChart,
  },
  {
    label: 'EMIs & recurring',
    href: '/emis',
    icon: CreditCard,
    also: ['/recurring-payments', '/emi-calculator'],
  },
  {
    label: 'Investments',
    href: '/investments',
    icon: DollarSign,
  },
  {
    label: 'Salary & Tax',
    href: '/salary',
    icon: Banknote,
  },
  {
    label: 'Budget',
    href: '/budget',
    icon: Target,
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: FileBarChart,
  },
  {
    label: 'Inbox',
    href: '/inbox',
    icon: Inbox,
  },
  {
    label: 'Statements',
    href: '/statements',
    icon: Sheet,
  },
];

export const AppSidebar = ({ ...props }: React.ComponentProps<typeof Sidebar>) => {
  const pathname = usePathname();
  return (
    <Sidebar {...props}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.href === '/'
                        ? pathname === item.href
                        : [item.href, ...(item.also ?? [])].some(
                            (href) => pathname === href || pathname.startsWith(`${href}/`),
                          )
                    }
                  >
                    <Link href={item.href} prefetch={false}>
                      <item.icon />
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
};
