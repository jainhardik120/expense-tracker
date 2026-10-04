import { ShieldX } from 'lucide-react';

import { StatusPage } from '@/components/status-page';

const UnauthorizedPage = () => (
  <StatusPage code="403" icon={ShieldX} title="Access Denied" tone="destructive">
    Sorry, you don&apos;t have permission to access this page. Please contact your administrator if
    you believe this is an error.
  </StatusPage>
);

export default UnauthorizedPage;
