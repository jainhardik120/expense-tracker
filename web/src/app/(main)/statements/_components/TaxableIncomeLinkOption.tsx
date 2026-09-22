'use client';

import { useState, type FormEvent } from 'react';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/format';
import { api } from '@/server/react';
import type { Statement } from '@/types';

type TaxableMode = 'full' | 'partial';

const getInitialMode = (statement: Statement): TaxableMode =>
  statement.taxableAmount !== null && Number(statement.taxableAmount) < Number(statement.amount)
    ? 'partial'
    : 'full';

export const TaxableIncomeLinkOption = ({
  statement,
  onSaved,
}: {
  statement: Statement;
  onSaved: () => void;
}) => {
  const [included, setIncluded] = useState(statement.taxableAmount !== null);
  const [mode, setMode] = useState<TaxableMode>(() => getInitialMode(statement));
  const [partialAmount, setPartialAmount] = useState(statement.taxableAmount ?? '');
  const mutation = api.statements.updateTaxableIncome.useMutation();
  const statementAmount = Number(statement.amount);
  const partialAmountNumber = Number(partialAmount);
  const partialAmountValid =
    Number.isFinite(partialAmountNumber) &&
    partialAmountNumber > 0 &&
    partialAmountNumber <= statementAmount;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let taxableAmount: string | null = null;
    if (included) {
      taxableAmount = mode === 'full' ? statement.amount : partialAmount.trim();
    }
    if (included && mode === 'partial' && !partialAmountValid) {
      toast.error('Taxable amount must be greater than zero and no more than the credit');
      return;
    }
    try {
      await mutation.mutateAsync({ statementId: statement.id, taxableAmount });
      toast.success(
        taxableAmount === null ? 'Removed from tax projection' : 'Taxable income saved',
      );
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  let projectedAmount = 0;
  if (included && (mode === 'full' || partialAmountValid)) {
    projectedAmount = mode === 'full' ? statementAmount : partialAmountNumber;
  }

  return (
    <form className="space-y-4 border-t pt-4" onSubmit={submit}>
      <div>
        <div className="font-medium">Taxable income</div>
        <p className="text-muted-foreground text-sm">
          Add all or part of this {formatCurrency(statementAmount)} credit to the tax projection.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={included}
          id={`taxable-${statement.id}`}
          onCheckedChange={(value) => {
            setIncluded(value === true);
          }}
        />
        <Label htmlFor={`taxable-${statement.id}`}>Include in tax projection</Label>
      </div>
      {included ? (
        <>
          <div className="space-y-2">
            <Label>Taxable portion</Label>
            <Select
              value={mode}
              onValueChange={(value) => {
                setMode(value as TaxableMode);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full transaction</SelectItem>
                <SelectItem value="partial">Partial amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === 'partial' ? (
            <div className="space-y-2">
              <Label htmlFor={`taxable-amount-${statement.id}`}>Taxable amount</Label>
              <Input
                id={`taxable-amount-${statement.id}`}
                inputMode="decimal"
                max={statementAmount}
                min={0.01}
                required
                step="0.01"
                type="number"
                value={partialAmount}
                onChange={(event) => {
                  setPartialAmount(event.target.value);
                }}
              />
              <p className="text-muted-foreground text-xs">
                For an FD closure, enter only the interest portion—not the returned principal.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <span className="text-muted-foreground">Added to taxable income</span>
        <span className="text-right font-semibold tabular-nums">
          {formatCurrency(projectedAmount)}
        </span>
      </div>
      <Button
        className="w-full"
        disabled={mutation.isPending || (included && mode === 'partial' && !partialAmountValid)}
        type="submit"
      >
        Save taxable amount
      </Button>
    </form>
  );
};
