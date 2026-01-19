import { createLoader, type SearchParams } from 'nuqs/server';

import { api } from '@/server/server';
import { recurringPaymentParser } from '@/types';

import Table from './_components/table';

const loader = createLoader(recurringPaymentParser);

export default async function RecurringPaymentsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const pageParams = await loader(searchParams);
  const data = await api.recurringPayments.getRecurringPayments({
    ...pageParams,
    isActive: pageParams.isActive ?? undefined,
  });
  return <Table data={data} />;
}
