'use client';

import { startOfMonth, endOfMonth } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
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

  const currentYear = new Date().getFullYear();
  const { start: defaultStart } = getDefaultDateRange(tz);

  const selectedMonthIndex = new Date(params.start ?? defaultStart).getMonth();

  const handleMonthChange = (monthIndex: number) => {
    const start = startOfMonth(new Date(currentYear, monthIndex, 1));
    const end = endOfMonth(new Date(currentYear, monthIndex, 1));

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
              {month} {currentYear}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default MonthSelector;
