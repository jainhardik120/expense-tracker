import type * as React from 'react';

import Link from 'next/link';

import { Calculator, DollarSign, LineChart, Sheet } from 'lucide-react';

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
    label: 'EMI Calculator',
    href: '/emi-calculator',
    icon: Calculator,
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
