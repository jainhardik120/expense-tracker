'use client';

import { api } from '@/server/react';

export default function Page() {
  const { data } = api.summary.getAggregatedData.useQuery({ aggregateBy: 'week' });
  return <div>{JSON.stringify(data)}</div>;
}
