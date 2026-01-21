import { useState } from 'react';

import { format, parse } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const DATE_FORMAT = 'dd-MM-yyyy';

const DateInput = (props: { date: Date; onChange: (date: Date) => void }) => {
  const [open, setOpen] = useState(false);
  const [dateString, setDateString] = useState(format(props.date, DATE_FORMAT));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateString(e.target.value);
    const parsed = parse(e.target.value, DATE_FORMAT, new Date());
    if (!isNaN(parsed.getTime()) && RegExp(/^\d{2}-\d{2}-\d{4}$/).test(e.target.value)) {
      props.onChange(parsed);
    }
  };

  const handleInputBlur = () => {
    const parsed = parse(dateString, DATE_FORMAT, new Date());
    if (!isNaN(parsed.getTime()) && RegExp(/^\d{4}-\d{2}-\d{2}$/).test(dateString)) {
      props.onChange(parsed);
    } else {
      setDateString(format(props.date, DATE_FORMAT));
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative min-w-44">
        <PopoverTrigger asChild>
          <div className="pointer-events-none absolute inset-0" />
        </PopoverTrigger>
        <Input
          className="w-full pr-10"
          placeholder="dd-mm-yyyy"
          type="text"
          value={dateString}
          onBlur={handleInputBlur}
          onChange={handleInputChange}
        />
        <Button
          className="absolute top-1/2 right-2 size-6 -translate-y-1/2 p-0"
          type="button"
          variant="ghost"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          <CalendarIcon className="h-4 w-4" />
        </Button>
      </div>
      <PopoverContent align="start" className="w-auto overflow-hidden p-0">
        <Calendar
          captionLayout="dropdown"
          defaultMonth={props.date}
          mode="single"
          selected={props.date}
          onSelect={(changedDate) => {
            if (changedDate !== undefined) {
              props.onChange(changedDate);
              setDateString(format(changedDate, DATE_FORMAT));
            }
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

export default DateInput;
