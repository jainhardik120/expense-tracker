import { redirect } from 'next/navigation';

/**
 * Entering the queue is no longer a page of its own -- it is the notifications
 * table with its editors switched on. Kept as a redirect so anything still
 * pointing here lands somewhere sensible rather than on a 404.
 */
export default function SmsBulkImportPage() {
  redirect('/sms-notifications');
}
