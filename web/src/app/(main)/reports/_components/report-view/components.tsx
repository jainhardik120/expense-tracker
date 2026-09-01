'use client';

/* eslint-disable react/prop-types -- every component here is bound to a catalog
   entry whose zod schema is the prop contract, and json-render validates against
   it before calling us. The rule cannot see through the shared `Props<T>`
   wrapper and reports each field as unvalidated. */
import type { ReactNode } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Cell, Pie, PieChart as RePieChart, Bar, BarChart as ReBarChart, XAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * DOM implementations of the report catalog.
 *
 * The PDF versions of these live in @helix-hq/pdf-report and draw with
 * react-pdf. These draw the same components with the app's own shadcn
 * primitives, so a report on the page looks like the rest of the app rather
 * than like a PDF embedded in it, while binding to the identical props.
 */

type Props<T> = { props: T; children?: ReactNode };

// The palette the PDF uses, carried on the spec by the branding step so the two
// renderings colour the same slice the same way.
const FALLBACK_PALETTE = ['#ec003f', '#2563eb', '#f59e0b', '#7c3aed', '#059669', '#0891b2'];

const HEADING_CLASS: Record<string, string> = {
  h1: 'text-2xl font-bold',
  h2: 'text-xl font-semibold',
  h3: 'text-lg font-semibold',
};

/** Treats absent, null and empty alike, which is how a template hides a field. */
const blank = (value?: string | null) => value === null || value === undefined || value === '';

const ALIGN_CLASS: Record<string, string> = {
  right: 'text-right',
  center: 'text-center',
  left: 'text-left',
};
const alignClass = (align?: string | null) => ALIGN_CLASS[align ?? 'left'] ?? 'text-left';

const TONE_CLASS: Record<string, string> = {
  danger: 'text-destructive',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  accent: 'text-primary',
};
const toneClass = (tone?: string | null) => TONE_CLASS[tone ?? ''] ?? '';

/** A container that only exists to group children in a PDF. */
const Passthrough = ({ children }: Props<unknown>) => <>{children}</>;

const Stack = ({ props, children }: Props<{ gap?: number | null; flex?: number | null }>) => (
  <div
    className="flex flex-col"
    style={{ gap: props.gap ?? undefined, flex: props.flex ?? undefined }}
  >
    {children}
  </div>
);

const Inline = ({
  props,
  children,
}: Props<{ gap?: number | null; wrap?: boolean | null; flex?: number | null }>) => (
  <div
    className={cn('flex flex-col gap-4 md:flex-row', props.wrap === true && 'flex-wrap')}
    style={{ gap: props.gap ?? undefined, flex: props.flex ?? undefined }}
  >
    {children}
  </div>
);

export const reportViewComponents = {
  // ---------------------------------------------------------------- shell ---
  Document: Passthrough,
  // A page break means nothing here, so the branded page furniture — wordmark,
  // generated-at, footer — is dropped: the app already frames the content.
  Page: ({ children }: Props<unknown>) => <div className="flex flex-col gap-6">{children}</div>,
  ReportPage: ({ children }: Props<unknown>) => (
    <div className="flex flex-col gap-6">{children}</div>
  ),
  KeepTogether: ({ children }: Props<unknown>) => <>{children}</>,
  View: Stack,
  Column: Stack,
  Row: Inline,
  Spacer: ({ props }: Props<{ height?: number | null }>) => (
    <div style={{ height: props.height ?? 8 }} />
  ),
  Divider: () => <hr className="border-border my-2" />,
  // Page furniture with no meaning in a scrolling page.
  PageNumber: () => null,

  // ------------------------------------------------------------- typography ---
  Heading: ({ props }: Props<{ text: string; level?: string | null; align?: string | null }>) => {
    const size = HEADING_CLASS[props.level ?? 'h3'] ?? HEADING_CLASS.h3;
    return <h2 className={cn(size, alignClass(props.align))}>{props.text}</h2>;
  },
  Text: ({
    props,
  }: Props<{ text: string; fontSize?: number | null; align?: string | null; color?: string | null }>) =>
    props.text === '' ? null : (
      <p className={cn('text-muted-foreground text-sm', alignClass(props.align))}>{props.text}</p>
    ),
  Link: ({ props }: Props<{ text: string; href: string }>) => (
    <Link className="underline underline-offset-4" href={props.href}>
      {props.text}
    </Link>
  ),
  Image: ({ props }: Props<{ src: string; width?: number | null; height?: number | null }>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" height={props.height ?? undefined} src={props.src} width={props.width ?? undefined} />
  ),
  List: ({ props }: Props<{ items: string[]; ordered?: boolean | null }>) => {
    const Tag = props.ordered === true ? 'ol' : 'ul';
    return (
      <Tag className={cn('ml-5 text-sm', props.ordered === true ? 'list-decimal' : 'list-disc')}>
        {props.items.map((item, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <li key={index}>{item}</li>
        ))}
      </Tag>
    );
  },

  // ----------------------------------------------------------------- panels ---
  Section: ({
    props,
    children,
  }: Props<{ title?: string | null; subtitle?: string | null }>) => (
    <Card>
      {blank(props.title) ? null : (
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          {blank(props.subtitle) ? null : <CardDescription>{props.subtitle}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  ),
  MetricGrid: ({ children }: Props<unknown>) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
  ),
  MetricCard: ({
    props,
  }: Props<{ label: string; value: string; tone?: string | null; hint?: string | null }>) => (
    <div className="bg-card rounded-lg border p-3">
      <p className="text-muted-foreground text-xs tracking-wide uppercase">{props.label}</p>
      <p className={cn('text-xl font-semibold', toneClass(props.tone))}>{props.value}</p>
      {blank(props.hint) ? null : <p className="text-muted-foreground mt-1 text-xs">{props.hint}</p>}
    </div>
  ),
  Callout: ({ props }: Props<{ text: string; tone?: string | null }>) =>
    props.text === '' ? null : (
      <div className={cn('bg-muted rounded-md border p-3 text-sm', toneClass(props.tone))}>
        {props.text}
      </div>
    ),

  // ----------------------------------------------------------------- tables ---
  DataTable: ({
    props,
  }: Props<{
    headers: string[];
    rows: string[][];
    align?: (string | null)[] | null;
    rowLinks?: (string | null)[] | null;
    columnWidths?: string[] | null;
    emptyText?: string | null;
  }>) => {
    if (props.headers.length === 0) {
      return null;
    }
    if (props.rows.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">
          {props.emptyText ?? 'No data for this period.'}
        </p>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            {props.headers.map((header, column) => (
              <TableHead
                // eslint-disable-next-line react/no-array-index-key
                key={column}
                className={alignClass(props.align?.[column])}
                style={{ width: props.columnWidths?.[column] }}
              >
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.map((cells, row) => {
            const href = props.rowLinks?.[row] ?? null;
            return (
              // eslint-disable-next-line react/no-array-index-key
              <TableRow key={row} className={cn('relative', href !== null && 'hover:bg-muted/60')}>
                {props.headers.map((_, column) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <TableCell key={column} className={alignClass(props.align?.[column])}>
                    {/* The anchor covers the row rather than wrapping the text, so
                        a linked row reads exactly like an unlinked one — the same
                        reason the PDF lays an annotation over the row. */}
                    {column === 0 && href !== null ? (
                      <Link aria-label={cells[0]} className="absolute inset-0" href={href} />
                    ) : null}
                    {cells[column] ?? ''}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  },
  Table: ({
    props,
  }: Props<{ columns: { header: string; align?: string | null }[]; rows: string[][] }>) => (
    <Table>
      <TableHeader>
        <TableRow>
          {props.columns.map((column, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <TableHead key={index} className={alignClass(column.align)}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.rows.map((cells, row) => (
          // eslint-disable-next-line react/no-array-index-key
          <TableRow key={row}>
            {cells.map((cell, column) => (
              // eslint-disable-next-line react/no-array-index-key
              <TableCell key={column}>{cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),

  // ----------------------------------------------------------------- charts ---
  PieChart: ({
    props,
  }: Props<{
    series: { label: string; value: number }[];
    title?: string | null;
    links?: (string | null)[] | null;
    innerRadius?: number | null;
    showLegend?: boolean | null;
  }>) => {
    const router = useRouter();
    if (props.series.length === 0) {
      return <p className="text-muted-foreground text-sm">No chart data for this period.</p>;
    }
    const colored = props.series.map((point, index) => ({
      ...point,
      fill: FALLBACK_PALETTE[index % FALLBACK_PALETTE.length],
      href: props.links?.[index] ?? null,
    }));
    return (
      <div className="flex flex-col gap-3">
        {blank(props.title) ? null : <p className="text-sm font-medium">{props.title}</p>}
        {/* An explicit height, not an aspect ratio: this sits in a flex column
            with no intrinsic width, so `aspect-square` resolves to zero and the
            chart never gets drawn. */}
        <ChartContainer className="h-[220px] w-full" config={{}}>
          <RePieChart>
            <Pie
              data={colored}
              dataKey="value"
              innerRadius={props.innerRadius ?? 0}
              nameKey="label"
              onClick={(entry: { href?: string | null }) => {
                if (entry.href !== null && entry.href !== undefined) {
                  router.push(entry.href);
                }
              }}
            >
              {colored.map((point) => (
                <Cell
                  key={point.label}
                  className={point.href === null ? undefined : 'cursor-pointer'}
                  fill={point.fill}
                />
              ))}
            </Pie>
          </RePieChart>
        </ChartContainer>
        {(props.showLegend ?? true) ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {colored.map((point) => (
              <li key={point.label} className="flex items-center gap-1.5 text-xs">
                <span
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: point.fill }}
                />
                {point.href === null ? (
                  <span className="text-muted-foreground">
                    {point.label} ({point.value})
                  </span>
                ) : (
                  <Link className="text-muted-foreground hover:text-foreground" href={point.href}>
                    {point.label} ({point.value})
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  },
  BarChart: ({
    props,
  }: Props<{ series: { label: string; value: number }[]; title?: string | null }>) => {
    if (props.series.length === 0) {
      return <p className="text-muted-foreground text-sm">No chart data for this period.</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        {blank(props.title) ? null : <p className="text-sm font-medium">{props.title}</p>}
        <ChartContainer className="max-h-[240px] w-full" config={{}}>
          <ReBarChart data={props.series}>
            <XAxis axisLine={false} dataKey="label" fontSize={11} tickLine={false} />
            <Bar dataKey="value" fill={FALLBACK_PALETTE[0]} radius={4} />
          </ReBarChart>
        </ChartContainer>
      </div>
    );
  },
  LineChart: ({
    props,
  }: Props<{ series: { label: string; value: number }[]; title?: string | null }>) => (
    <ChartContainer className="max-h-[240px] w-full" config={{}}>
      <ReBarChart data={props.series}>
        <XAxis axisLine={false} dataKey="label" fontSize={11} tickLine={false} />
        <Bar dataKey="value" fill={FALLBACK_PALETTE[1]} radius={4} />
      </ReBarChart>
    </ChartContainer>
  ),
};
