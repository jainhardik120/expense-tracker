import Link from 'next/link';

import { ShieldX, Home } from 'lucide-react';

import { Button } from '@/components/ui/button';

const UnauthorizedPage = () => {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center space-y-6 text-center">
        <div className="bg-destructive/10 rounded-full p-6">
          <ShieldX className="text-destructive size-16" strokeWidth={1.5} />
        </div>
        <h1 className="text-foreground text-7xl font-bold tracking-tighter">403</h1>
        <h2 className="text-foreground text-2xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">
          Sorry, you don&apos;t have permission to access this page. Please contact your
          administrator if you believe this is an error.
        </p>
        <div className="flex flex-col gap-3 pt-4 sm:flex-row">
          <Button asChild variant="default">
            <Link href="/">
              <Home />
              Go to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UnauthorizedPage;
