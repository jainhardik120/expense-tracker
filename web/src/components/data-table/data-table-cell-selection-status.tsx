import type { CellSelectionStats } from '@/hooks/use-cell-range-selection';
import { formatNumber } from '@/lib/format';

export const hasCellSelectionSummary = (
  stats: CellSelectionStats | null,
): stats is CellSelectionStats => stats !== null && stats.count > 1;

export const DataTableCellSelectionStatus = ({ stats }: { stats: CellSelectionStats }) => {
  return (
    <div className="flex items-center gap-4 tabular-nums">
      <span>
        Count <span className="text-foreground font-medium">{stats.count}</span>
      </span>
      {stats.numeric > 0 ? (
        <>
          <span>
            Sum <span className="text-foreground font-medium">{formatNumber(stats.sum)}</span>
          </span>
          <span>
            Average{' '}
            <span className="text-foreground font-medium">{formatNumber(stats.average)}</span>
          </span>
        </>
      ) : null}
    </div>
  );
};
