'use client';

import type * as React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Calculator, CreditCard, DollarSign, LineChart, RefreshCw, Sheet, MessageSquareMore } from 'lucide-react';

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
    label: 'Statements',
    href: '/statements',
    icon: Sheet,
  },
  {
    label: 'Investments',
    href: '/investments',
    icon: DollarSign,
  },
  {
    label: 'EMIs',
    href: '/emis',
    icon: CreditCard,
  },
  {
    label: 'Recurring Payments',
    href: '/recurring-payments',
    icon: RefreshCw,
  },
  {
    label: 'EMI Calculator',
    href: '/emi-calculator',
    icon: Calculator,
  },
  {
    label: 'SMS Notifications',
    href: '/sms-notifications',
    icon: MessageSquareMore,
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
                    <Link href={item.href}>
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
