import { parseAsStringEnum, parseAsTimestamp } from 'nuqs/server';

import { DateTruncValues } from '.';

const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;
const MONTHS = 30 * DAYS;

export const aggregationParser = {
  period: parseAsStringEnum(DateTruncValues).withDefault('week'),
  start: parseAsTimestamp.withDefault(new Date(Date.now() - MONTHS)),
  end: parseAsTimestamp.withDefault(new Date()),
};
