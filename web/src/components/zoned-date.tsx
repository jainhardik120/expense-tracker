'use client';

import { useZonedFormat } from '@/hooks/use-zoned-format';
import { DATE_FORMAT } from '@/lib/format';

export const ZonedDate = ({
  value,
  pattern = DATE_FORMAT.date,
  fallback = '-',
}: {
  value: Date | string | null | undefined;
  pattern?: string;
  fallback?: string;
}) => {
  const zoned = useZonedFormat();
  return value === null || value === undefined ? fallback : zoned(value, pattern);
};
