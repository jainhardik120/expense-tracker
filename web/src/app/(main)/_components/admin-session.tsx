'use client';

import { Button } from '@/components/ui/button';
import type { Session } from '@/lib/auth';
import { authClient } from '@/lib/auth-client';

const AdminSession = ({ session }: { session: Session }) => {
  return (
    <>
      {session.session.impersonatedBy !== null && session.session.impersonatedBy !== undefined && (
        <Button
          size="sm"
          variant="destructive"
          onClick={async () => {
            await authClient.admin.stopImpersonating();
            window.location.href = '/account/admin/users';
          }}
        >
          Stop Impersonating
        </Button>
      )}
    </>
  );
};

export default AdminSession;
