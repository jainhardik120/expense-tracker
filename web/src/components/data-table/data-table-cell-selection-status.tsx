import type { CellSelectionStats } from '@/hooks/use-cell-range-selection';

const format = (value: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Whether a selection has anything worth saying about it.
 *
 * One cell is not a sum. Asked by the table rather than answered here, because
 * the table is what decides between this and the row count it would otherwise
 * be showing in the same place.
 */
export const hasCellSelectionSummary = (
  stats: CellSelectionStats | null,
): stats is CellSelectionStats => stats !== null && stats.count > 1;

/**
 * What the selected cells come to, shown along the bottom of the table.
 *
 * A spreadsheet's status bar: the answer to "what do these add up to" without
 * having to take the figures anywhere to ask it. It sits where the number of
 * selected rows goes, which is both where the eye already goes for a total and
 * the one place on the page that can gain a line without moving the table.
 */
export const DataTableCellSelectionStatus = ({ stats }: { stats: CellSelectionStats }) => {
  return (
    <div className="flex items-center gap-4 tabular-nums">
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
