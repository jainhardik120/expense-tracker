'use client';

import { useMemo } from 'react';

import { PaymentScheduleTable } from '@/components/payment-schedule-table';
import { calculateSchedule } from '@/server/helpers/emi-calculations';
import { api } from '@/server/react';
import { type Emi } from '@/types';

const EmiDetails = ({ emi }: { emi: Emi }) => {
  const { data: linkedStatements = [] } = api.emis.getLinkedStatements.useQuery({
    emiId: emi.id,
  });
  const schedule = useMemo(() => {
    return calculateSchedule(emi);
  }, [emi]);
  return (
    <div className="flex flex-col gap-4">
      <PaymentScheduleTable linkedStatements={linkedStatements} result={schedule} />
    </div>
  );
};

export default EmiDetails;
