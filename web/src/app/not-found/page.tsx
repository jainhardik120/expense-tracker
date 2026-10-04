import { FileQuestion } from 'lucide-react';

import { StatusPage } from '@/components/status-page';

const NotFoundPage = () => (
  <StatusPage code="404" icon={FileQuestion} title="Page Not Found" tone="muted">
    Oops! The page you&apos;re looking for doesn&apos;t exist. It might have been moved, deleted, or
    you may have mistyped the URL.
  </StatusPage>
);

export default NotFoundPage;
