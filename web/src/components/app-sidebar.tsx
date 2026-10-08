'use client';

import type * as React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  Calculator,
  CreditCard,
  DollarSign,
  LineChart,
  RefreshCw,
  Sheet,
  FileBarChart,
  Banknote,
  Inbox,
  Target,
  Users,
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
    label: 'EMI Calculator',
    href: '/emi-calculator',
    icon: Calculator,
  },
  {
    label: 'EMIs',
    href: '/emis',
    icon: CreditCard,
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
    label: 'Friends',
    href: '/friends',
    icon: Users,
  },
  {
    label: 'Recurring Payments',
    href: '/recurring-payments',
    icon: RefreshCw,
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
                        : pathname === item.href || pathname.startsWith(`${item.href}/`)
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
