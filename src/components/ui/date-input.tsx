import { useEffect, useState } from 'react';

import { format, parse } from 'date-fns';
import { Calendar1 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const DATE_FORMAT = 'dd-MM-yyyy';

const DateInput = (props: { date: Date; onChange: (date: Date) => void }) => {
  const [open, setOpen] = useState(false);
  const [dateString, setDateString] = useState('');

  useEffect(() => {
    setDateString(format(props.date, DATE_FORMAT));
  }, [props.date]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateString(e.target.value);
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
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor>
          <Input
            className="w-62 pr-10"
            type="text"
            value={dateString}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            placeholder="DDMMYYYY"
          />
        </PopoverAnchor>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="absolute top-1/2 right-2 size-6 -translate-y-1/2 p-0">
            <Calendar1 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto overflow-hidden p-0">
          <Calendar
            captionLayout="dropdown"
            mode="single"
            selected={props.date}
            onSelect={(changedDate) => {
              if (changedDate !== undefined) {
                props.onChange(changedDate);
                setDateString(format(changedDate, DATE_FORMAT));
              }
              setOpen(false);
            }}
            defaultMonth={props.date}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DateInput;
