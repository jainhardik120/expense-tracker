import type { CellSelectionStats } from '@/hooks/use-cell-range-selection';

const format = (value: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * What the selected cells come to, read off the bottom of the table.
 *
 * A spreadsheet's status bar: the answer to "what do these add up to" without
 * having to take the figures anywhere to ask it. Quiet until there is something
 * to say -- one cell is not a sum, and a rectangle of dates has no total.
 */
export const DataTableCellSelectionStatus = ({ stats }: { stats: CellSelectionStats | null }) => {
  if (stats === null || stats.count < 2) {
    return null;
  }
  return (
    <div className="text-muted-foreground flex items-center gap-4 text-sm tabular-nums">
      <span>
        Count <span className="text-foreground font-medium">{stats.count}</span>
      </span>
      {stats.numeric > 0 ? (
        <>
          <span>
            Sum <span className="text-foreground font-medium">{format(stats.sum)}</span>
          </span>
          <span>
            Average <span className="text-foreground font-medium">{format(stats.average)}</span>
          </span>
        </>
      ) : null}
    </div>
  );
};
