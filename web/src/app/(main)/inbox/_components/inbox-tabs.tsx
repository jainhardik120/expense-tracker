import { PageTabs } from '@/components/page-tabs';
import { type RouterOutput } from '@/server/routers';

type Overview = RouterOutput['statementImports']['getOverview'];

export const InboxTabs = ({ overview }: { overview: Overview }) => (
  <PageTabs
    tabs={[
      { href: '/inbox/sms', label: 'SMS', count: overview.pendingSms },
      { href: '/inbox/statements', label: 'Statements', count: overview.statementsToReview },
      { href: '/inbox/balances', label: 'Balances', count: overview.balanceMismatches },
      { href: '/inbox/email', label: 'Email', count: overview.emailsNotImported },
    ]}
  />
);
