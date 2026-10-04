'use client';

import { useState } from 'react';

import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { errorMessage } from '@/lib/utils';

export type Boundary = { id: string; boundaryDate: Date };

type BoundaryOption = { id: string; label: string };

export const useBoundaryOptions = (boundaries: Boundary[]): BoundaryOption[] => {
  const zoned = useZonedFormat();
  return boundaries.map((boundary) => ({
    id: boundary.id,
    label: zoned(boundary.boundaryDate, 'MMM dd, yyyy'),
  }));
};

export const useReportDownload = (successMessage?: string) => {
  const [pending, setPending] = useState(false);
  const download = async (fromBoundaryId: string, toBoundaryId: string) => {
    setPending(true);
    try {
      const response = await fetch('/api/reports/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromBoundaryId, toBoundaryId }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'money-report.pdf';
      link.click();
      URL.revokeObjectURL(url);
      if (successMessage !== undefined) {
        toast(successMessage);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  return { pending, download };
};

export const BoundarySelect = ({
  id,
  value,
  options,
  placeholder,
  triggerClassName,
  onChange,
}: {
  id: string;
  value: string;
  options: BoundaryOption[];
  placeholder: string;
  triggerClassName?: string;
  onChange: (value: string) => void;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className={triggerClassName} id={id}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.id} value={option.id}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
