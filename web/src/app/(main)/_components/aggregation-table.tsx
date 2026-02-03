'use client';

import { aggregationTableColumns } from '@/components/aggregation-table-columns';
import { DataTable } from '@/components/data-table/data-table';
import { useTimezone } from '@/components/time-zone-setter';
import { useDataTable } from '@/hooks/use-data-table';
import { type DateTruncUnit, type ProcessedAggregationData } from '@/types';

const Table = ({ data, unit }: { data: ProcessedAggregationData[]; unit: DateTruncUnit }) => {
  const timezone = useTimezone();
  const columns = aggregationTableColumns(unit, timezone);
  const { table } = useDataTable({
    data,
    pageCount: 1,
    columns,
  });
  return (
    <DataTable enablePagination={false} getItemValue={(i) => i.date.toISOString()} table={table} />
  );
};

export default Table;
