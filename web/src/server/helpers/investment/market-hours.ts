import { MS_PER_MINUTE } from '@/types';

const MINUTES_PER_HOUR = 60;
const IST_OFFSET_MINUTES = 330;
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTES_PAST = 15;
const MARKET_CLOSE_HOUR = 15;
const MARKET_CLOSE_MINUTES_PAST = 30;
const MARKET_OPEN_MINUTE = MARKET_OPEN_HOUR * MINUTES_PER_HOUR + MARKET_OPEN_MINUTES_PAST;
const MARKET_CLOSE_MINUTE = MARKET_CLOSE_HOUR * MINUTES_PER_HOUR + MARKET_CLOSE_MINUTES_PAST;
const SATURDAY = 6;
const SUNDAY = 0;

export const isIndianMarketOpen = (now: Date) => {
  const ist = new Date(now.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);
  const day = ist.getUTCDay();
  const minute = ist.getUTCHours() * MINUTES_PER_HOUR + ist.getUTCMinutes();
  return (
    day !== SATURDAY &&
    day !== SUNDAY &&
    minute >= MARKET_OPEN_MINUTE &&
    minute <= MARKET_CLOSE_MINUTE
  );
};
