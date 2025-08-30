'use client';
import type React from 'react';

import { Label } from '@/components/ui/label';
import type { FieldWrapperProps } from '@/lib/types';
import { cn } from '@/lib/utils';

export type { FieldWrapperProps } from '@/lib/formedible/types';

// Simplified wrapper that doesn't interfere with TanStack Form's state management
export const FieldWrapper: React.FC<FieldWrapperProps> = ({
  fieldApi,
  label,
  description,
  labelClassName,
  wrapperClassName,
  children,
  htmlFor,
  showErrors = true,
}) => {
  const { name } = fieldApi;
  const hasErrors = fieldApi.state?.meta?.isTouched && fieldApi.state?.meta?.errors?.length > 0;

  return (
    <div className={cn('space-y-1.5', wrapperClassName)}>
      {label ? (
        <Label className={cn('text-sm font-medium', labelClassName)} htmlFor={htmlFor || name}>
          {label}
        </Label>
      ) : null}
      {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}

      {children}

      {showErrors && hasErrors ? (
        <div className="text-destructive pt-1 text-xs">
          {fieldApi.state?.meta?.errors?.map((err: string | Error, index: number) => (
            <p key={index}>{typeof err === 'string' ? err : err?.message || 'Invalid'}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
};
