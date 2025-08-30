'use client';
import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { Check, X, Loader2 } from 'lucide-react';

import type { InlineValidationWrapperProps } from '@/lib/types';
import { cn } from '@/lib/utils';

export const InlineValidationWrapper: React.FC<InlineValidationWrapperProps> = ({
  children,
  fieldApi,
  inlineValidation = {},
  className,
}) => {
  const { enabled = true, debounceMs = 300, showSuccess = true, asyncValidator } = inlineValidation;

  const [validationState, setValidationState] = useState<{
    isValidating: boolean;
    isValid: boolean | null;
    message: string | null;
  }>({
    isValidating: false,
    isValid: null,
    message: null,
  });

  const { state } = fieldApi;
  const { value } = state;
  const hasErrors = state.meta.errors.length > 0;
  const { isTouched } = state.meta;

  // Validation function
  const validateValue = useCallback(
    async (currentValue: unknown) => {
      if (!enabled || !asyncValidator) {
        return;
      }

      setValidationState((prev) => ({ ...prev, isValidating: true }));

      try {
        const result = await asyncValidator(currentValue);

        setValidationState({
          isValidating: false,
          isValid: result === null,
          message: result,
        });
      } catch (error) {
        setValidationState({
          isValidating: false,
          isValid: false,
          message: error instanceof Error ? error.message : 'Validation failed',
        });
      }
    },
    [enabled, asyncValidator],
  );

  // Debounced validation function
  const debouncedValidate = useMemo(
    () => debounce(validateValue, debounceMs),
    [validateValue, debounceMs],
  );

  // Trigger validation when value changes
  useEffect(() => {
    if (enabled && isTouched && value !== undefined && value !== '') {
      debouncedValidate(value);
    } else {
      setValidationState({
        isValidating: false,
        isValid: null,
        message: null,
      });
    }
  }, [value, isTouched, enabled, debouncedValidate]);

  // Reset validation state when field is reset
  useEffect(() => {
    if (!isTouched) {
      setValidationState({
        isValidating: false,
        isValid: null,
        message: null,
      });
    }
  }, [isTouched]);

  const getValidationIcon = () => {
    if (!enabled || !isTouched) {
      return null;
    }

    if (validationState.isValidating) {
      return <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />;
    }

    if (hasErrors) {
      return <X className="text-destructive h-4 w-4" />;
    }

    if (validationState.isValid === false) {
      return <X className="text-destructive h-4 w-4" />;
    }

    if (showSuccess && validationState.isValid === true) {
      return <Check className="h-4 w-4 text-green-500" />;
    }

    if (showSuccess && !hasErrors && isTouched && value) {
      return <Check className="h-4 w-4 text-green-500" />;
    }

    return null;
  };

  const getValidationMessage = () => {
    if (!enabled || !isTouched) {
      return null;
    }

    // Show form validation errors first
    if (hasErrors) {
      return state.meta.errors[0];
    }

    // Show async validation message
    if (validationState.message) {
      return validationState.message;
    }

    return null;
  };

  const validationIcon = getValidationIcon();
  const validationMessage = getValidationMessage();

  return (
    <div className={cn('relative', className)}>
      {/* Field with validation icon */}
      <div className="relative">
        {children}
        {validationIcon ? (
          <div className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
            {validationIcon}
          </div>
        ) : null}
      </div>

      {/* Validation message */}
      {validationMessage ? (
        <div
          className={cn(
            'mt-1 flex items-center gap-1 text-xs',
            hasErrors || validationState.isValid === false
              ? 'text-destructive'
              : 'text-muted-foreground',
          )}
        >
          {typeof validationMessage === 'string'
            ? validationMessage
            : (validationMessage as Error)?.message || 'Validation error'}
        </div>
      ) : null}
    </div>
  );
};

// Debounce utility function
const debounce = <T,>(func: T, wait: number): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};
