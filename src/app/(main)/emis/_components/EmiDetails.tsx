'use client';

import { useMemo } from 'react';

import { PaymentScheduleTable } from '@/components/payment-schedule-table';
import { calculateSchedule } from '@/server/helpers/emi-calculations';
import { api } from '@/server/react';
import { type Emi } from '@/types';

const EmiDetails = ({ emi }: { emi: Emi }) => {
  const { data = [] } = api.emis.getLinkedStatements.useQuery({
    emiId: emi.id,
  });
  const schedule = useMemo(() => {
    return calculateSchedule(emi);
  }, [emi]);
  return (
    <div className="flex flex-col gap-4">
      <p>{JSON.stringify(data)}</p>
      <PaymentScheduleTable result={schedule} />
    </div>
  );
};

export default EmiDetails;
