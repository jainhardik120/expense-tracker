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
  MessageSquareMore,
  FileBarChart,
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
    label: 'SMS Notifications',
    href: '/sms-notifications',
    icon: MessageSquareMore,
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
                      item.href === '/' ? pathname === item.href : pathname.includes(item.href)
                    }
                  >
                    {/* Without this every sidebar link prefetches as soon as it
                        enters the viewport, so opening any page fires a render
                        of all eight — each running its own queries against a
                        database that allows ~15 connections in total. Hovering
                        still prefetches, which is one page at a time. */}
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
