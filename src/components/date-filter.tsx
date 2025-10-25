'use client';

import { endOfDay } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { useQueryStates } from 'nuqs';

import DateInput from '@/components/ui/date-input';
import { getDefaultDateRange } from '@/lib/date';
import { dateParser } from '@/types';

import { useTimezone } from './time-zone-setter';

const DateFilter = () => {
  const [params, setParams] = useQueryStates(dateParser);
  const tz = useTimezone();
  const { start: defaultStart, end: defaultEnd } = getDefaultDateRange(tz);
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Start Date:</span>
        <DateInput
          date={params.start ?? defaultStart}
          onChange={(date) => setParams({ start: date }, { shallow: false })}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">End Date:</span>
        <DateInput
          date={params.end ?? defaultEnd}
          onChange={(date) => {
            const localEnd = endOfDay(date);
            const utcEnd = fromZonedTime(localEnd, tz);
            void setParams({ end: utcEnd }, { shallow: false });
          }}
        />
      </div>
    </>
  );
};

export default DateFilter;
