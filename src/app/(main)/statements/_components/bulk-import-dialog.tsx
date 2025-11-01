'use client';

import { useState } from 'react';

import * as Papa from 'papaparse';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/server/react';

type CsvRow = {
  amount: string;
  category: string;
  date: string;
  statementKind: 'expense' | 'outside_transaction' | 'friend_transaction';
  accountName?: string;
  friendName?: string;
  tag?: string;
};

const DEFAULT_DATE_FORMAT = 'dd/MM/yyyy';
const MAX_ERROR_DISPLAY = 10;

const dateFormats = [
  { value: 'yyyy-MM-dd', label: 'YYYY-MM-DD (e.g., 2024-03-15)' },
  { value: 'dd/MM/yyyy', label: 'DD/MM/YYYY (e.g., 15/03/2024)' },
  { value: 'MM/dd/yyyy', label: 'MM/DD/YYYY (e.g., 03/15/2024)' },
  { value: 'dd-MM-yyyy', label: 'DD-MM-YYYY (e.g., 15-03-2024)' },
  { value: 'MM-dd-yyyy', label: 'MM-DD-YYYY (e.g., 03-15-2024)' },
];

type ValidationResult = {
  valid: number;
  invalid: Array<{ row: number; errors: string[] }>;
  summary: {
    accounts: string[];
    friends: string[];
    categories: string[];
    tags: string[];
  };
};

const placeholderText = `amount,category,date,statementKind,accountName,friendName,tag
100.50,Food,2024-03-15,expense,Cash,,groceries
50.00,Transport,2024-03-16,friend_transaction,Bank,John,travel`;

export const BulkImportDialog = ({ onImportSuccess }: { onImportSuccess: () => void }) => {
  const [open, setOpen] = useState(false);
  const [csvData, setCsvData] = useState<string>('');
  const [dateFormat, setDateFormat] = useState<string>(DEFAULT_DATE_FORMAT);
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [step, setStep] = useState<'input' | 'validate' | 'confirm'>('input');

  const validateMutation = api.bulkImport.validateCsv.useMutation();
  const importMutation = api.bulkImport.importStatements.useMutation();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvData(text);
    };
    reader.readAsText(file);
  };

  const handleParseCsv = () => {
    if (csvData.trim().length === 0) {
      toast.error('Please provide CSV data');
      return;
    }

    type CsvRecord = Partial<Record<string, string>>;

    Papa.parse<CsvRecord>(csvData, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: CsvRow[] = results.data.map((row) => {
          const statementKind: CsvRow['statementKind'] =
            row.statementKind === undefined
              ? 'expense'
              : (row.statementKind as CsvRow['statementKind']);
          const accountName: string | undefined =
            row.accountName === undefined || row.accountName.length === 0
              ? undefined
              : row.accountName;
          const friendName: string | undefined =
            row.friendName === undefined || row.friendName.length === 0
              ? undefined
              : row.friendName;
          const tag: string | undefined =
            row.tag === undefined || row.tag.length === 0 ? undefined : row.tag;

          return {
            amount: (row.amount?.length ?? 0) > 0 && row.amount !== undefined ? row.amount : '',
            category:
              (row.category?.length ?? 0) > 0 && row.category !== undefined ? row.category : '',
            date: (row.date?.length ?? 0) > 0 && row.date !== undefined ? row.date : '',
            statementKind,
            accountName,
            friendName,
            tag,
          };
        });

        if (rows.length === 0) {
          toast.error('No valid rows found in CSV');
          return;
        }

        setParsedRows(rows);
        setStep('validate');
      },
    });
  };

  const handleValidate = () => {
    validateMutation.mutate(
      { rows: parsedRows, dateFormat },
      {
        onSuccess: (result) => {
          setValidationResult(result);
          if (result.invalid.length === 0) {
            setStep('confirm');
          } else {
            toast.error(`Validation failed: ${result.invalid.length} invalid rows`);
          }
        },
        onError: (error) => {
          toast.error(`Validation error: ${error.message}`);
        },
      },
    );
  };

  const handleImport = () => {
    importMutation.mutate(
      { rows: parsedRows, dateFormat },
      {
        onSuccess: (result) => {
          toast.success(`Successfully imported ${result.imported} statements`);
          setOpen(false);
          resetDialog();
          onImportSuccess();
        },
        onError: (error) => {
          toast.error(`Import error: ${error.message}`);
        },
      },
    );
  };

  const resetDialog = () => {
    setCsvData('');
    setParsedRows([]);
    setValidationResult(null);
    setStep('input');
    setDateFormat(DEFAULT_DATE_FORMAT);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetDialog();
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="h-8" variant="outline">
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Statements</DialogTitle>
          <DialogDescription>
            Upload or paste CSV data to import multiple statements at once
          </DialogDescription>
        </DialogHeader>

        {step === 'input' && (
          <div className="space-y-4 overflow-x-auto">
            <div className="space-y-2">
              <Label>Date Format</Label>
              <Select value={dateFormat} onValueChange={setDateFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dateFormats.map((format) => (
                    <SelectItem key={format.value} value={format.value}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Upload CSV File</Label>
              <Input accept=".csv" type="file" onChange={handleFileUpload} />
            </div>

            <div className="text-muted-foreground text-center text-sm">OR</div>

            <div className="space-y-2">
              <Label>Paste CSV Data</Label>
              <Textarea
                className="h-[200px] overflow-y-auto font-mono text-xs"
                placeholder={placeholderText}
                value={csvData}
                onChange={(e) => {
                  setCsvData(e.target.value);
                }}
              />
            </div>

            <div className="text-muted-foreground space-y-2 text-sm">
              <p className="font-semibold">CSV Format Requirements:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  <strong>Required columns:</strong> amount, category, date, statementKind
                </li>
                <li>
                  <strong>Optional columns:</strong> accountName, friendName, tag
                </li>
                <li>
                  <strong>statementKind values:</strong> expense, outside_transaction,
                  friend_transaction
                </li>
                <li>
                  <strong>expense:</strong> requires EITHER accountName OR friendName (not both)
                </li>
                <li>
                  <strong>friend_transaction:</strong> requires BOTH accountName AND friendName
                </li>
                <li>
                  <strong>outside_transaction:</strong> accountName optional, friendName must be
                  empty
                </li>
                <li>Account and friend names must match existing records (case-insensitive)</li>
                <li>Only one tag per statement is supported</li>
              </ul>
            </div>

            <Button
              className="w-full"
              disabled={csvData.trim().length === 0}
              onClick={handleParseCsv}
            >
              Parse & Validate
            </Button>
          </div>
        )}

        {step === 'validate' && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm">
                <strong>Parsed Rows:</strong> {parsedRows.length}
              </p>
            </div>

            {validationResult !== null && (
              <div className="space-y-3">
                <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    <strong>Valid Rows:</strong> {validationResult.valid}
                  </p>
                </div>

                {validationResult.invalid.length > 0 && (
                  <div className="space-y-2 rounded-lg bg-red-50 p-4 dark:bg-red-950">
                    <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                      Invalid Rows: {validationResult.invalid.length}
                    </p>
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {validationResult.invalid.slice(0, MAX_ERROR_DISPLAY).map((error) => (
                        <div key={error.row} className="text-xs text-red-700 dark:text-red-300">
                          <strong>Row {error.row}:</strong> {error.errors.join(', ')}
                        </div>
                      ))}
                      {validationResult.invalid.length > MAX_ERROR_DISPLAY && (
                        <p className="text-xs text-red-600">
                          ... and {validationResult.invalid.length - MAX_ERROR_DISPLAY} more errors
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => {
                  setStep('input');
                }}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={validateMutation.isPending}
                onClick={handleValidate}
              >
                {validateMutation.isPending ? 'Validating...' : 'Validate'}
              </Button>
            </div>
          </div>
        )}

        {step === 'confirm' && validationResult !== null && (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>Ready to import {validationResult.valid} statements</strong>
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => {
                  setStep('validate');
                }}
              >
                Back
              </Button>
              <Button className="flex-1" disabled={importMutation.isPending} onClick={handleImport}>
                {importMutation.isPending ? 'Importing...' : 'Import Now'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
