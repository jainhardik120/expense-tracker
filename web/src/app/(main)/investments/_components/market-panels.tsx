'use client';

import { type RouterOutput } from '@/server/routers';

import { AssetAllocationCard } from './asset-allocation-card';
import { MetalPricesCard } from './metal-prices-card';

type AssetAllocation =
  RouterOutput['investments']['getInvestmentsInitialData']['dashboard']['assetAllocation'];

export const MarketPanels = ({ allocation }: { allocation: AssetAllocation }) => (
  <div className="grid gap-4 xl:grid-cols-2">
    <AssetAllocationCard allocation={allocation} />
    <MetalPricesCard />
  </div>
);
