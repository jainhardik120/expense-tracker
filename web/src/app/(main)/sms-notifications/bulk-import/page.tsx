import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { api } from '@/server/server';

import { BulkImportGrid } from '../_components/bulk-import-grid';

export default async function SmsBulkImportPage() {
  const [queue, accounts, friends, categories] = await Promise.all([
    api.smsNotifications.getBulkImportRows(),
    api.accounts.getAccounts(),
    api.friends.getFriends(),
    api.statements.getCategories({}),
  ]);
  const { rows, tagOptions } = queue;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Button asChild className="w-fit px-0" size="sm" variant="link">
          <Link href="/sms-notifications">
            <ArrowLeft className="size-4" />
            Back to notifications
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Bulk import</h1>
        <p className="text-muted-foreground text-sm">
          Every pending message, filled in from how messages like it were filed before. Correct
          anything that looks wrong, untick what should not go in, then import the rest at once.
        </p>
      </div>
      {/* Keyed on the queue itself: once an import changes what is pending, the
          grid remounts with the new rows instead of holding edits to rows that
          no longer exist. An unchanged queue keeps the key, and the edits. */}
      <BulkImportGrid
        key={rows.map((row) => row.id).join(',')}
        accounts={accounts}
        categories={categories}
        friends={friends}
        initialRows={rows}
        tags={tagOptions}
      />
    </div>
  );
}
