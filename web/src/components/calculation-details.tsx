'use client';

import type { ReactElement } from 'react';

import { HelpCalc, HelpNote, type CalcRow } from '@/components/help/help-visuals';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

export const CalculationDetails = ({
  title,
  trigger,
  rows,
  result,
  note,
}: {
  title?: string;
  trigger?: ReactElement;
  rows: CalcRow[];
  result: CalcRow;
  note: string;
}) => {
  const details = (
    <div className="flex flex-col gap-2">
      <HelpCalc result={result} rows={rows} />
      <HelpNote>{note}</HelpNote>
    </div>
  );

  if (trigger === undefined) {
    return details;
  }

  return (
    <HoverCard closeDelay={200} openDelay={100}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent className="w-96 max-w-[calc(100vw-2rem)] space-y-2 text-left text-sm">
        {title === undefined ? null : <p className="font-semibold">{title}</p>}
        {details}
      </HoverCardContent>
    </HoverCard>
  );
};
