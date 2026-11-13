<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI rules

When the user states a UI rule or preference, add it to this list in the same change. They should never have to repeat one.

- No nested cards, at any screen size. Never put a bordered, rounded box inside a `Card` or another box. Group content inside a card with spacing and dividers instead.
- Show any list of records with the shared `DataTable` (`@/components/data-table/data-table` plus `useDataTable`), never a hand-built `<ul>`, `divide-y` list or flex rows. A card that holds records follows `src/app/(main)/salary/_components/bonuses-card.tsx`: `Card` > `CardHeader` with `CardTitle`, optional `CardDescription`, and the add or record button in `CardAction` > `CardContent` > `<DataTable background={false} showBorder={false} enablePagination={false} />`, with a muted one-line empty state.
- Table columns: amounts and counts are right-aligned with `meta: { align: 'right' }` and `tabular-nums`. Put secondary detail (a date, a status) as a muted `text-xs` line under the main cell value rather than in extra badges or boxes. Row actions go in a last `actions` column (a ghost icon or small button, `RowActions` when there are several), and the same actions also go in `rowMenu` for the right-click menu where the page's other tables do that.
- New UI reuses the existing building blocks (`Card`, `DataTable`, `MutationModal`, `DeleteConfirmationDialog`, `ZonedDate`, `formatCurrency`) and matches the screens around it. Look at a neighbouring card before inventing a layout.
- A small feature (a calculator, a check, a settings list such as bank interest) lives in a dialog opened from a button on an existing page's card, not on a new page and not as another card on the page.
- Keep summary cards (such as "Your numbers") to one line per row: put a secondary figure, such as a 1D change, inline before the main value instead of on a second line, and leave out rows that add clutter.
