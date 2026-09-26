'use client';

import { startOfMonth, endOfMonth } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { useQueryStates } from 'nuqs';

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { getDefaultDateRange } from '@/lib/date';
import { dateParser } from '@/types';

import { useTimezone } from './time-zone-setter';

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MonthSelector = () => {
  const [params, setParams] = useQueryStates(dateParser);
  const tz = useTimezone();

  const { start: defaultStart } = getDefaultDateRange(tz);

  // Anchored to the year already in the filter, not to today's: the range can be
  // set to another year from elsewhere on the page, and the selector has to agree
  // with it rather than silently claim the month belongs to this year.
  const selectedStart = toZonedTime(params.start ?? defaultStart, tz);
  const selectedYear = selectedStart.getFullYear();
  const selectedMonthIndex = selectedStart.getMonth();

  const handleMonthChange = (monthIndex: number) => {
    const start = startOfMonth(new Date(selectedYear, monthIndex, 1));
    const end = endOfMonth(new Date(selectedYear, monthIndex, 1));

    const zonedStart = fromZonedTime(start, tz);
    const zonedEnd = fromZonedTime(end, tz);

    void setParams({ start: zonedStart, end: zonedEnd }, { shallow: false });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Select Month:</span>
      <Select
        value={String(selectedMonthIndex)}
        onValueChange={(value) => {
          handleMonthChange(Number(value));
        }}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select month" />
        </SelectTrigger>
        <SelectContent>
          {months.map((month, idx) => (
            <SelectItem key={month} value={String(idx)}>
              {month} {selectedYear}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default MonthSelector;
