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
