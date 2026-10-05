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
  Banknote,
  Scale,
  Target,
  Mail,
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
    label: 'Balance checks',
    href: '/balance-checks',
    icon: Scale,
  },
  {
    label: 'Budget',
    href: '/budget',
    icon: Target,
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
    label: 'Email forwarding',
    href: '/email-forwarding',
    icon: Mail,
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
