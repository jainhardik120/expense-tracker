'use client';

import { api } from '@/server/react';
import { type Emi } from '@/types';

const EmiDetails = ({ emi }: { emi: Emi }) => {
  const { data = [] } = api.emis.getLinkedStatements.useQuery({
    emiId: emi.id,
  });
  return <div>{JSON.stringify(data)}</div>;
};

export default EmiDetails;
