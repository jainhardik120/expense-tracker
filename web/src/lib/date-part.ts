import { fromZonedTime, toZonedTime } from 'date-fns-tz';

// Replaces the calendar day of `base` with the one from `picked`, keeping the
// time-of-day. Year, month and day must be set in a single call: setting them
// one at a time overflows whenever the picked day doesn't exist in the base
// month, e.g. picking the 31st while `base` sits in a 30-day month first rolls
// over to the 1st of the next month and the day is lost.
export const withDatePart = (base: Date, picked: Date) => {
  const updated = new Date(base);
  updated.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return updated;
};

// As above, but the day being replaced is the one `timeZone` was showing rather
// than the one the server's clock was.
//
// Timestamps are stored as UTC instants and read in the user's timezone
// everywhere else, so a transaction at 00:28 IST belongs to a day that UTC has
// not reached yet. Setting the date part without saying which zone's date it is
// moves such a transaction by a whole day the moment anyone touches it.
export const withZonedDatePart = (base: Date, picked: Date, timeZone: string) => {
  const zoned = toZonedTime(base, timeZone);
  zoned.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return fromZonedTime(zoned, timeZone);
};
