'use client';

import { useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { DataTable } from '@/components/data-table/data-table';
import Modal from '@/components/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useDataTable } from '@/hooks/use-data-table';
import type { ColumnDef } from '@/lib/table';
import { errorMessage } from '@/lib/utils';

type Counts = Record<string, { imported: number; skipped: number }>;

type Summary = { alreadyImported: boolean; exportedAt: string; counts: Counts };

type PreviewRow = { table: string; label: string; imported: number; skipped: number };

const tableLabels: Record<string, string> = {
  friends_profiles: 'Friends',
  bank_account: 'Accounts',
  credit_card_accounts: 'Credit cards',
  account_balance_checks: 'Balance checks',
  account_interest_rates: 'Interest rates',
  recurring_payments: 'Recurring payments',
  emis: 'EMIs',
  salary_components: 'Salary components',
  salary_revisions: 'Salary revisions',
  salary_revision_components: 'Salary revision lines',
  salary_bonuses: 'Bonuses',
  statements: 'Transactions',
  self_transfer_statements: 'Self transfers',
  splits: 'Splits',
  salary_payments: 'Salary payments',
  salary_payment_components: 'Salary payment lines',
  salary_tax_settings: 'Tax settings',
  investments: 'Investments',
  investment_payments: 'Investment payments',
  rsu_vests: 'RSU vests',
  epfo_interest_credits: 'EPFO interest',
  instrument_asset_classes: 'Asset class tags',
  budget_years: 'Budget years',
  budget_lines: 'Budget lines',
  budget_income_lines: 'Budget income lines',
  report_boundaries: 'Report boundaries',
  report_templates: 'Report templates',
  sms_notifications: 'SMS messages',
  statement_imports: 'Statement imports',
  statement_import_links: 'Statement import links',
};

const previewColumns: ColumnDef<PreviewRow>[] = [
  {
    id: 'label',
    accessorFn: (row) => row.label,
    header: 'Data',
    cell: ({ row }) => <span className="font-medium">{row.original.label}</span>,
  },
  {
    id: 'imported',
    accessorFn: (row) => row.imported,
    header: 'Adds',
    cell: ({ row }) => <span className="tabular-nums">{row.original.imported}</span>,
    meta: { align: 'right' },
  },
  {
    id: 'skipped',
    accessorFn: (row) => row.skipped,
    header: 'Keeps yours',
    cell: ({ row }) =>
      row.original.skipped === 0 ? null : (
        <span className="text-muted-foreground tabular-nums">{row.original.skipped}</span>
      ),
    meta: { align: 'right' },
  },
];

const sendFile = async (file: File, dryRun: boolean): Promise<Summary> => {
  const response = await fetch(`/api/data/import${dryRun ? '?dryRun=1' : ''}`, {
    method: 'POST',
    body: file,
  });
  const body = (await response.json()) as Summary | { error: string };
  if (!response.ok || 'error' in body) {
    throw new Error('error' in body ? body.error : 'Import failed');
  }
  return body;
};

const ImportPreview = ({ summary }: { summary: Summary }) => {
  const rows = useMemo(
    () =>
      Object.entries(summary.counts)
        .filter(([, count]) => count.imported + count.skipped > 0)
        .map(([table, count]) => ({ table, label: tableLabels[table] ?? table, ...count })),
    [summary],
  );
  const { table } = useDataTable({ data: rows, columns: previewColumns, pageCount: -1 });
  return (
    <DataTable
      background={false}
      enablePagination={false}
      getItemValue={(row) => row.table}
      showBorder={false}
      table={table}
    />
  );
};

export const DataTransferDialog = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = (chosen: File | null) => {
    setFile(chosen);
    setSummary(null);
    if (chosen === null) {
      return;
    }
    setBusy(true);
    sendFile(chosen, true)
      .then(setSummary)
      .finally(() => {
        setBusy(false);
      })
      .catch((error: unknown) => toast.error(errorMessage(error)));
  };

  const confirm = () => {
    if (file === null) {
      return;
    }
    setBusy(true);
    sendFile(file, false)
      .then(() => {
        toast('Data imported');
        setOpen(false);
        setFile(null);
        setSummary(null);
        router.refresh();
        return true;
      })
      .finally(() => {
        setBusy(false);
      })
      .catch((error: unknown) => toast.error(errorMessage(error)));
  };

  return (
    <Modal
      className="sm:max-w-xl"
      description="Move your data between accounts. Logins, passkeys, saved statement passwords and the email inbox stay behind."
      open={open}
      setOpen={setOpen}
      title="Your data"
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">
            Everything in this account as one compressed file.
          </p>
          <Button asChild size="sm" variant="outline">
            <a download href="/api/data/export">
              <Download /> Export
            </a>
          </Button>
        </div>
        <Separator />
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Imported data is added next to what you have. Rows you already have, such as a budget
            year with the same start, are kept.
          </p>
          <Input
            accept=".br"
            disabled={busy}
            type="file"
            onChange={(event) => {
              choose(event.target.files?.[0] ?? null);
            }}
          />
          {summary === null ? null : (
            <>
              {summary.alreadyImported ? (
                <p className="text-destructive text-sm">
                  This file was already imported into this account.
                </p>
              ) : null}
              <ImportPreview summary={summary} />
              <div className="flex justify-end">
                <Button disabled={busy || summary.alreadyImported} size="sm" onClick={confirm}>
                  <Upload /> Import
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
