'use client';

import { type ReactNode, useMemo } from 'react';

import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { PackageCheck, SquarePen, Trash2, Undo2 } from 'lucide-react';
import { z } from 'zod';

import { DataTable } from '@/components/data-table/data-table';
import { RowActions, RowActionTrigger } from '@/components/data-table/row-actions';
import { type RowMenuAction } from '@/components/data-table/row-context-menu';
import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import { type DialogControl } from '@/components/modal';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useDataTable } from '@/hooks/use-data-table';
import { DATE_FORMAT, formatCurrency } from '@/lib/format';
import type { ColumnDef } from '@/lib/table';
import { api } from '@/server/react';
import { type RouterOutput } from '@/server/routers';

type RsuSummary = RouterOutput['investments']['rsu']['getSummary'];
type Grant = RsuSummary['grants'][number];
type Vest = Grant['vests'][number];
type Refresh = () => Promise<void> | void;
type VestRow = Vest & { livePrice: number | null };
type VestDialogProps = {
  vest: Vest;
  refresh: Refresh;
  dialog?: DialogControl;
  trigger?: ReactNode;
};

const USD = 'USD';
const MAX_UNITS = 1_000_000;
const UNIT_DECIMALS = 4;

const formatVestDate = (date: Date) => formatInTimeZone(date, 'UTC', DATE_FORMAT.date);

const formatUnits = (units: number) =>
  units.toLocaleString('en-US', { maximumFractionDigits: UNIT_DECIMALS });

const unitsLabel = (units: number) => `${formatUnits(units)} ${units === 1 ? 'unit' : 'units'}`;

const positive = z
  .string()
  .trim()
  .refine((value) => Number(value) > 0, { message: 'Enter a number above 0' });

const releaseSchema = z.object({
  unitPrice: positive,
  fxRateToInr: positive,
  unitsWithheld: z
    .string()
    .trim()
    .refine((value) => value !== '' && Number(value) >= 0, { message: 'Enter 0 or more' }),
});

const releaseFields: FormField<z.input<typeof releaseSchema>>[] = [
  {
    name: 'unitPrice',
    label: 'Price per share on the vest date (USD)',
    type: 'number',
    min: 0,
    step: 0.0001,
    description: 'The fair market value on the release confirmation.',
  },
  { name: 'fxRateToInr', label: 'USD/INR rate', type: 'number', min: 0, step: 0.0001 },
  { name: 'unitsWithheld', label: 'Shares withheld for tax', type: 'number', min: 0, step: 0.001 },
];

const ReleaseDialog = ({ vest, refresh, dialog, trigger }: VestDialogProps) => {
  const mutation = api.investments.rsu.release.useMutation();
  return (
    <MutationModal
      button={trigger}
      defaultValues={{
        unitPrice: vest.suggested?.unitPrice?.toString() ?? '',
        fxRateToInr: vest.suggested?.fxRateToInr?.toString() ?? '',
        unitsWithheld: '',
      }}
      dialog={dialog}
      fields={releaseFields}
      mapInput={(values) => ({ vestId: vest.id, ...values })}
      modalDescription={`${unitsLabel(vest.units)} vested on ${formatVestDate(vest.vestDate)}. The shares left after tax become a regular holding.`}
      mutation={mutation}
      refresh={refresh}
      schema={releaseSchema}
      successToast={(result) => `${unitsLabel(result.unitsReleased)} added to your holdings`}
      titleText="Record RSU release"
    />
  );
};

const EditReleaseDialog = ({ vest, refresh, dialog, trigger }: VestDialogProps) => {
  const mutation = api.investments.rsu.editRelease.useMutation();
  return (
    <MutationModal
      button={trigger}
      defaultValues={{
        unitPrice: vest.unitPrice?.toString() ?? '',
        fxRateToInr: vest.fxRateToInr?.toString() ?? '',
        unitsWithheld: vest.unitsWithheld?.toString() ?? '',
      }}
      dialog={dialog}
      fields={releaseFields}
      mapInput={(values) => ({ vestId: vest.id, ...values })}
      modalDescription={`${unitsLabel(vest.units)} vested on ${formatVestDate(vest.vestDate)}. The holding from this release is updated to match.`}
      mutation={mutation}
      refresh={refresh}
      schema={releaseSchema}
      successToast={() => 'Release updated'}
      titleText="Edit RSU release"
    />
  );
};

const vestSchema = z.object({ vestDate: z.date(), units: positive });

const vestFields: FormField<z.input<typeof vestSchema>>[] = [
  { name: 'vestDate', label: 'Vest date', type: 'date' },
  { name: 'units', label: 'Units', type: 'number', min: 0, max: MAX_UNITS, step: 0.001 },
];

const toVestDay = (date: Date) => format(date, 'yyyy-MM-dd');

const fromVestDay = (date: Date) =>
  new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

const EditVestDialog = ({ vest, refresh, dialog, trigger }: VestDialogProps) => {
  const mutation = api.investments.rsu.editVest.useMutation();
  return (
    <MutationModal
      button={trigger}
      defaultValues={{ vestDate: fromVestDay(vest.vestDate), units: vest.units.toString() }}
      dialog={dialog}
      fields={vestFields}
      mapInput={(values) => ({
        vestId: vest.id,
        vestDate: toVestDay(values.vestDate),
        units: values.units,
      })}
      mutation={mutation}
      refresh={refresh}
      schema={vestSchema}
      successToast={() => 'Vest updated'}
      titleText="Edit vest"
    />
  );
};

const UndoReleaseDialog = ({ vest, refresh, dialog, trigger }: VestDialogProps) => {
  const mutation = api.investments.rsu.undoRelease.useMutation();
  return (
    <DeleteConfirmationDialog
      actionLabel="Undo release"
      description="This deletes the holding created by this release and moves the units back to unvested."
      dialog={dialog}
      mutation={mutation}
      mutationInput={{ vestId: vest.id }}
      pendingLabel="Undoing..."
      refresh={() => void refresh()}
      successToast={() => 'Release undone'}
      title="Undo this release?"
    >
      {trigger}
    </DeleteConfirmationDialog>
  );
};

const RemoveVestDialog = ({ vest, refresh, dialog, trigger }: VestDialogProps) => {
  const mutation = api.investments.rsu.deleteVest.useMutation();
  return (
    <DeleteConfirmationDialog
      actionLabel="Remove"
      description={`Remove the ${formatVestDate(vest.vestDate)} vest of ${unitsLabel(vest.units)} from the schedule.`}
      dialog={dialog}
      mutation={mutation}
      mutationInput={{ vestId: vest.id }}
      pendingLabel="Removing..."
      refresh={() => void refresh()}
      successToast={() => 'Vest removed'}
      title="Remove this vest?"
    >
      {trigger}
    </DeleteConfirmationDialog>
  );
};

const AddVestButton = ({ grant, refresh }: { grant: Grant; refresh: Refresh }) => {
  const mutation = api.investments.rsu.addVests.useMutation();
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          Add vest
        </Button>
      }
      defaultValues={{ vestDate: new Date(), units: '' }}
      fields={vestFields}
      mapInput={(values) => ({
        grantId: grant.id,
        tranches: [{ vestDate: toVestDay(values.vestDate), units: values.units }],
      })}
      modalDescription="One row of the vesting schedule from your broker."
      mutation={mutation}
      refresh={refresh}
      schema={vestSchema}
      successToast={() => 'Vest added'}
      titleText={`Add a ${grant.instrumentCode} vest`}
    />
  );
};

const vestStatus = (vest: Vest) => {
  if (vest.isReleased) {
    return 'Released';
  }
  return vest.isDue ? 'Due, not recorded' : 'Upcoming';
};

const vestValueUsd = (vest: VestRow) => {
  if (vest.isReleased) {
    return vest.units * (vest.unitPrice ?? 0);
  }
  return vest.livePrice === null ? null : vest.units * vest.livePrice;
};

const optional = (value: number | null, render: (value: number) => string) =>
  value === null ? <span className="text-muted-foreground">-</span> : render(value);

const VestActions = ({ vest, refresh }: { vest: Vest; refresh: Refresh }) => (
  <div className="flex items-center justify-end gap-1">
    {vest.isDue ? (
      <ReleaseDialog
        refresh={refresh}
        trigger={<Button size="sm">Record release</Button>}
        vest={vest}
      />
    ) : null}
    <RowActions collapse="always">
      {vest.isReleased ? (
        <EditReleaseDialog
          refresh={refresh}
          trigger={<RowActionTrigger icon={SquarePen} label="Edit release" />}
          vest={vest}
        />
      ) : (
        <EditVestDialog
          refresh={refresh}
          trigger={<RowActionTrigger icon={SquarePen} label="Edit vest" />}
          vest={vest}
        />
      )}
      {vest.isReleased ? (
        <UndoReleaseDialog
          refresh={refresh}
          trigger={<RowActionTrigger icon={Undo2} label="Undo release" />}
          vest={vest}
        />
      ) : (
        <RemoveVestDialog
          refresh={refresh}
          trigger={<RowActionTrigger destructive icon={Trash2} label="Remove vest" />}
          vest={vest}
        />
      )}
    </RowActions>
  </div>
);

const createVestColumns = (refresh: Refresh): ColumnDef<VestRow>[] => [
  {
    id: 'vestDate',
    accessorFn: (vest) => vest.vestDate,
    header: 'Vest date',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{formatVestDate(row.original.vestDate)}</p>
        <p className="text-muted-foreground text-xs">{vestStatus(row.original)}</p>
      </div>
    ),
  },
  {
    id: 'units',
    accessorFn: (vest) => vest.units,
    header: 'Units',
    cell: ({ row }) => formatUnits(row.original.units),
    meta: { align: 'right' },
  },
  {
    id: 'value',
    accessorFn: vestValueUsd,
    header: 'Value',
    cell: ({ row }) => (
      <div>
        <p>{optional(vestValueUsd(row.original), (amount) => formatCurrency(amount, USD))}</p>
        <p className="text-muted-foreground text-xs">
          {row.original.isReleased
            ? `at ${formatCurrency(row.original.unitPrice ?? 0, USD)}`
            : 'at today’s price'}
        </p>
      </div>
    ),
    meta: { align: 'right' },
  },
  {
    id: 'withheld',
    accessorFn: (vest) => vest.unitsWithheld,
    header: 'Withheld',
    cell: ({ row }) => optional(row.original.unitsWithheld, formatUnits),
    meta: { align: 'right' },
  },
  {
    id: 'delivered',
    accessorFn: (vest) => vest.unitsReleased,
    header: 'Delivered',
    cell: ({ row }) => optional(row.original.unitsReleased, formatUnits),
    meta: { align: 'right' },
  },
  {
    id: 'perquisite',
    accessorFn: (vest) => vest.perquisiteInr,
    header: 'Perquisite',
    cell: ({ row }) => optional(row.original.perquisiteInr, (amount) => formatCurrency(amount)),
    meta: { align: 'right' },
  },
  {
    id: 'taxWithheld',
    accessorFn: (vest) => vest.taxWithheldInr,
    header: 'Tax withheld',
    cell: ({ row }) => optional(row.original.taxWithheldInr, (amount) => formatCurrency(amount)),
    meta: { align: 'right' },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <VestActions refresh={refresh} vest={row.original} />,
  },
];

const vestRowActions = (vest: Vest, refresh: Refresh): RowMenuAction[] => {
  if (vest.isReleased) {
    return [
      {
        key: 'edit',
        label: 'Edit release',
        icon: SquarePen,
        dialog: (control) => <EditReleaseDialog dialog={control} refresh={refresh} vest={vest} />,
      },
      {
        key: 'undo',
        label: 'Undo release',
        icon: Undo2,
        dialog: (control) => <UndoReleaseDialog dialog={control} refresh={refresh} vest={vest} />,
      },
    ];
  }
  const release: RowMenuAction = {
    key: 'release',
    label: 'Record release',
    icon: PackageCheck,
    dialog: (control) => <ReleaseDialog dialog={control} refresh={refresh} vest={vest} />,
  };
  return [
    ...(vest.isDue ? [release] : []),
    {
      key: 'edit',
      label: 'Edit vest',
      icon: SquarePen,
      dialog: (control) => <EditVestDialog dialog={control} refresh={refresh} vest={vest} />,
    },
    {
      key: 'remove',
      label: 'Remove vest',
      icon: Trash2,
      destructive: true,
      dialog: (control) => <RemoveVestDialog dialog={control} refresh={refresh} vest={vest} />,
    },
  ];
};

const grantSummary = (grant: Grant) => {
  const parts = [
    `${unitsLabel(grant.totalUnits)} granted`,
    `${formatUnits(grant.vestedUnits)} vested`,
    `${formatUnits(grant.unvestedUnits)} unvested`,
  ];
  if (grant.livePrice !== null) {
    const unvestedUsd = grant.unvestedUnits * grant.livePrice;
    const inr =
      grant.liveFxRateToInr === null
        ? ''
        : ` (${formatCurrency(unvestedUsd * grant.liveFxRateToInr)})`;
    parts.push(`unvested worth ${formatCurrency(unvestedUsd, USD)}${inr}`);
  }
  if (grant.unscheduledUnits > 0) {
    parts.push(`${unitsLabel(grant.unscheduledUnits)} without a vest date`);
  }
  if (grant.unscheduledUnits < 0) {
    parts.push(`schedule has ${unitsLabel(-grant.unscheduledUnits)} more than the grant`);
  }
  return parts.join(' · ');
};

const GrantCard = ({ grant, refresh }: { grant: Grant; refresh: Refresh }) => {
  const columns = useMemo(() => createVestColumns(refresh), [refresh]);
  const rows = useMemo(
    () => grant.vests.map((vest) => ({ ...vest, livePrice: grant.livePrice })),
    [grant],
  );
  const { table } = useDataTable({ data: rows, columns, pageCount: -1 });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{grant.instrumentCode} RSU vesting</CardTitle>
        <CardDescription>{grantSummary(grant)}</CardDescription>
        <CardAction>
          <AddVestButton grant={grant} refresh={refresh} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Add the vest dates from your broker to track releases.
          </p>
        ) : (
          <DataTable
            background={false}
            enablePagination={false}
            getItemValue={(vest) => vest.id}
            rowMenu={(vest) => vestRowActions(vest, refresh)}
            showBorder={false}
            table={table}
          />
        )}
      </CardContent>
    </Card>
  );
};

export const RsuCard = ({ show, refresh }: { show: boolean; refresh: Refresh }) => {
  const { data } = api.investments.rsu.getSummary.useQuery();
  if (data === undefined || data.grants.length === 0) {
    return null;
  }
  const hasDueVest = data.grants.some((grant) => grant.vests.some((vest) => vest.isDue));
  if (!show && !hasDueVest) {
    return null;
  }
  return (
    <>
      {data.grants.map((grant) => (
        <GrantCard key={grant.id} grant={grant} refresh={refresh} />
      ))}
    </>
  );
};
