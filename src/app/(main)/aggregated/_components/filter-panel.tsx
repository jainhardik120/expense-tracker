'use client';

import { useQueryStates } from 'nuqs';

import DateInput from '@/components/date-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateTruncValues, aggregationParser } from '@/types';

const FilterPanel = () => {
  const [params, setParams] = useQueryStates(aggregationParser, { shallow: false });

  return (
    <div className="flex flex-row items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Period:</span>
        <Select value={params.period} onValueChange={(value) => setParams({ period: value })}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DateTruncValues.map((period) => (
              <SelectItem key={period} value={period}>
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Start Date:</span>
        <DateInput date={params.start} onChange={(date) => setParams({ start: date })} />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">End Date:</span>
        <DateInput date={params.end} onChange={(date) => setParams({ end: date })} />
      </div>
    </div>
  );
};

export default FilterPanel;
