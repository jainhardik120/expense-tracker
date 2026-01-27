import Link from 'next/link';

import { FileQuestion, Home } from 'lucide-react';

import { Button } from '@/components/ui/button';

const NotFoundPage = () => {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center space-y-6 text-center">
        <div className="bg-muted rounded-full p-6">
          <FileQuestion className="text-muted-foreground size-16" strokeWidth={1.5} />
        </div>
        <h1 className="text-foreground text-7xl font-bold tracking-tighter">404</h1>
        <h2 className="text-foreground text-2xl font-semibold">Page Not Found</h2>
        <p className="text-muted-foreground max-w-md">
          Oops! The page you&apos;re looking for doesn&apos;t exist. It might have been moved,
          deleted, or you may have mistyped the URL.
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

export default NotFoundPage;
