import { PageTabs } from '@/components/page-tabs';

export default function PaymentsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">EMIs & recurring</h2>
        <p className="text-muted-foreground text-sm">
          Loans paid off in instalments, payments that repeat on a schedule, and a calculator for
          working out a new EMI before taking it.
        </p>
      </div>
      <PageTabs
        tabs={[
          { href: '/emis', label: 'EMIs' },
          { href: '/recurring-payments', label: 'Recurring' },
          { href: '/emi-calculator', label: 'EMI calculator' },
        ]}
      />
      {children}
    </div>
  );
}
