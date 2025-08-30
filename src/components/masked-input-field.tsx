'use client';
import React, { useState, useEffect, useRef } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BaseFieldProps } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MaskedInputFieldProps extends BaseFieldProps {
  maskedInputConfig?: {
    mask: string | ((value: string) => string);
    placeholder?: string;
    showMask?: boolean;
    guide?: boolean;
    keepCharPositions?: boolean;
    pipe?: (
      conformedValue: string,
      config: unknown,
    ) => false | string | { value: string; indexesOfPipedChars: number[] };
  };
}

// Common mask patterns
const MASK_PATTERNS = {
  phone: '(000) 000-0000',
  ssn: '000-00-0000',
  creditCard: '0000 0000 0000 0000',
  date: '00/00/0000',
  time: '00:00',
  zipCode: '00000',
  zipCodeExtended: '00000-0000',
  currency: '$0,000.00',
};

export const MaskedInputField: React.FC<MaskedInputFieldProps> = ({
  fieldApi,
  label,
  description,
  placeholder,
  wrapperClassName,
  labelClassName,
  inputClassName,
  maskedInputConfig = {},
}) => {
  const { name } = fieldApi;

  const {
    mask = '',
    showMask = false,
    guide = true,

    pipe,
  } = maskedInputConfig;

  const [displayValue, setDisplayValue] = useState('');
  const [rawValue, setRawValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Apply mask to value
  const applyMask = React.useCallback(
    (value: string): string => {
      if (!mask) {
        return value;
      }

      if (typeof mask === 'function') {
        return mask(value);
      }

      // Handle string mask patterns
      let maskedValue = '';
      let digitIndex = 0;
      let letterIndex = 0;
      const cleanDigits = value.replace(/\D/g, ''); // Extract digits
      const cleanLetters = value.replace(/[^a-zA-Z]/g, ''); // Extract letters

      for (let i = 0; i < mask.length; i++) {
        const maskChar = mask[i];

        if (maskChar === '0' || maskChar === '9') {
          // Digit placeholder
          if (digitIndex < cleanDigits.length) {
            maskedValue += cleanDigits[digitIndex];
            digitIndex++;
          } else if (guide && showMask) {
            maskedValue += '_';
          } else {
            break; // Stop if no more digits and not showing guide
          }
        } else if (maskChar === 'A' || maskChar === 'a') {
          // Letter placeholder
          if (letterIndex < cleanLetters.length) {
            const char = cleanLetters[letterIndex];
            maskedValue += maskChar === 'A' ? char.toUpperCase() : char.toLowerCase();
            letterIndex++;
          } else if (guide && showMask) {
            maskedValue += '_';
          } else {
            break; // Stop if no more letters and not showing guide
          }
        } else {
          // Literal character
          maskedValue += maskChar;
        }
      }

      // Apply pipe function if provided
      if (pipe) {
        const piped = pipe(maskedValue, { mask, guide, showMask });
        if (piped === false) {
          return displayValue; // Reject the change
        }
        if (typeof piped === 'string') {
          return piped;
        }
        if (piped && typeof piped === 'object' && piped.value) {
          return piped.value;
        }
      }

      return maskedValue;
    },
    [mask, guide, showMask, pipe, displayValue],
  );

  // Initialize from field value
  useEffect(() => {
    const value = fieldApi.state?.value || '';
    setRawValue(value);
    setDisplayValue(applyMask(value));
  }, [fieldApi.state?.value, applyMask]);

  // Extract raw value from masked value
  const extractRawValue = (maskedValue: string): string => {
    if (!mask || typeof mask === 'function') {
      return maskedValue;
    }

    // For string masks, extract only the actual input characters
    let rawValue = '';
    let maskIndex = 0;

    for (let i = 0; i < maskedValue.length && maskIndex < mask.length; i++) {
      const char = maskedValue[i];
      const maskChar = mask[maskIndex];

      if (maskChar === '0' || maskChar === '9') {
        if (/\d/.test(char)) {
          rawValue += char;
        }
        maskIndex++;
      } else if (maskChar === 'A' || maskChar === 'a') {
        if (/[a-zA-Z]/.test(char)) {
          rawValue += char;
        }
        maskIndex++;
      } else if (char === maskChar) {
        // Skip literal characters
        maskIndex++;
      } else {
        // Character doesn't match mask, skip it
        continue;
      }
    }

    return rawValue;
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const newRawValue = extractRawValue(inputValue);
    const newDisplayValue = applyMask(newRawValue);

    setRawValue(newRawValue);
    setDisplayValue(newDisplayValue);
    fieldApi.handleChange(newRawValue);
  };

  // Handle key down for better UX
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.target as HTMLInputElement;
    const { selectionStart, selectionEnd } = input;

    // Handle backspace to skip over literal characters
    if (
      e.key === 'Backspace' &&
      selectionStart !== null &&
      selectionEnd !== null &&
      selectionStart === selectionEnd &&
      selectionStart > 0
    ) {
      const maskChar = typeof mask === 'string' ? mask[selectionStart - 1] : '';

      // If the previous character is a literal (not a placeholder), skip it
      if (
        maskChar &&
        maskChar !== '0' &&
        maskChar !== '9' &&
        maskChar !== 'A' &&
        maskChar !== 'a'
      ) {
        e.preventDefault();
        const newCursorPos = selectionStart - 1;
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
        }, 0);
      }
    }
  };

  // Get placeholder text
  const getPlaceholder = (): string => {
    if (placeholder) {
      return placeholder;
    }
    if (maskedInputConfig.placeholder) {
      return maskedInputConfig.placeholder;
    }
    if (showMask && typeof mask === 'string') {
      return mask.replace(/[09Aa]/g, '_');
    }
    return '';
  };

  return (
    <div className={cn('space-y-2', wrapperClassName)}>
      {label ? (
        <Label className={labelClassName} htmlFor={name}>
          {label}
        </Label>
      ) : null}

      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}

      <Input
        ref={inputRef}
        className={inputClassName}
        id={name}
        name={name}
        placeholder={getPlaceholder()}
        value={displayValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
      />

      {/* Show mask pattern hint */}
      {mask && typeof mask === 'string' ? (
        <div className="text-muted-foreground text-xs">
          Format: {mask.replace(/[09]/g, '#').replace(/[Aa]/g, 'A')}
        </div>
      ) : null}

      {/* Show raw value for debugging */}
      {process.env.NODE_ENV === 'development' && rawValue !== displayValue && (
        <div className="text-muted-foreground text-xs">Raw value: {rawValue}</div>
      )}

      {fieldApi.state?.meta?.errors && fieldApi.state?.meta?.errors.length > 0 ? (
        <p className="text-destructive text-sm">{fieldApi.state?.meta?.errors[0]}</p>
      ) : null}
    </div>
  );
};

// Export common mask patterns for convenience
export { MASK_PATTERNS };
