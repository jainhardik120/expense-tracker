'use client';

import { useQueryStates } from 'nuqs';

import DateInput from '@/components/ui/date-input';
import { dateParser } from '@/types';

const DateFilter = () => {
  const [params, setParams] = useQueryStates(dateParser);

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Start Date:</span>
        <DateInput
          date={params.start}
          onChange={(date) => setParams({ start: date }, { shallow: false })}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">End Date:</span>
        <DateInput
          date={params.end}
          onChange={(date) => setParams({ end: date }, { shallow: false })}
        />
      </div>
    </>
  );
};

export default DateFilter;
