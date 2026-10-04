import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const withDatePart = (base: Date, picked: Date) => {
  const updated = new Date(base);
  updated.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return updated;
};

export const withZonedDatePart = (base: Date, picked: Date, timeZone: string) => {
  const zoned = toZonedTime(base, timeZone);
  zoned.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return fromZonedTime(zoned, timeZone);
};
