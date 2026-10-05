import { api } from '@/server/server';

import BalanceChecksView from './_components/balance-checks-view';

export default async function BalanceChecksPage() {
  const overview = await api.balanceChecks.getOverview();
  return <BalanceChecksView overview={overview} />;
}
