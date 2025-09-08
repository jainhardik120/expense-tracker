'use client';

import { useQueryStates } from 'nuqs';

import DateInput from '@/components/ui/date-input';
import { statementParser } from '@/types';

const FilterPanel = () => {
  const [params, setParams] = useQueryStates(statementParser);

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Start Date:</span>
        <DateInput date={params.start} onChange={(date) => setParams({ start: date })} />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">End Date:</span>
        <DateInput date={params.end} onChange={(date) => setParams({ end: date })} />
      </div>
    </>
  );
};

export default FilterPanel;
