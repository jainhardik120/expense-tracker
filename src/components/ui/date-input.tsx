import { useEffect, useState } from 'react';

import { ChevronDownIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const DateInput = (props: { date: Date; onChange: (date: Date) => void }) => {
  const [open, setOpen] = useState(false);
  const [dateString, setDateString] = useState('');
  useEffect(() => {
    setDateString(
      props.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    );
  }, [props.date]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="w-32 justify-between font-normal" variant="outline">
          {dateString}
          <ChevronDownIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto overflow-hidden p-0">
        <Calendar
          captionLayout="dropdown"
          mode="single"
          selected={props.date}
          onSelect={(changedDate) => {
            if (changedDate !== undefined) {
              const updatedDate = new Date(props.date);
              updatedDate.setDate(changedDate.getDate());
              updatedDate.setMonth(changedDate.getMonth());
              updatedDate.setFullYear(changedDate.getFullYear());
              props.onChange(updatedDate);
            }
            setOpen(false);
          }}
          defaultMonth={props.date}
        />
      </PopoverContent>
    </Popover>
  );
};

export default DateInput;
