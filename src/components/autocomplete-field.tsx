'use client';
import React, { useState, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { BaseFieldProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { FieldWrapper } from './base-field-wrapper';

interface AutocompleteOption {
  value: string;
  label: string;
}

interface AutocompleteFieldProps extends BaseFieldProps {
  autocompleteConfig?: {
    options?: string[] | AutocompleteOption[];
    asyncOptions?: (query: string) => Promise<string[] | AutocompleteOption[]>;
    debounceMs?: number;
    minChars?: number;
    maxResults?: number;
    allowCustom?: boolean;
    placeholder?: string;
    noOptionsText?: string;
    loadingText?: string;
  };
}

export const AutocompleteField: React.FC<AutocompleteFieldProps> = ({
  fieldApi,
  placeholder,
  inputClassName,
  autocompleteConfig = {},
  ...wrapperProps
}) => {
  const {
    options = [],
    asyncOptions,
    debounceMs = 300,
    minChars = 1,
    maxResults = 10,
    allowCustom = true,
    noOptionsText = 'No options found',
    loadingText = 'Loading...',
  } = autocompleteConfig;

  const [inputValue, setInputValue] = useState(fieldApi.state?.value || '');
  const [filteredOptions, setFilteredOptions] = useState<AutocompleteOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Normalize options to consistent format
  const normalizeOptions = (opts: string[] | AutocompleteOption[]): AutocompleteOption[] => {
    return opts.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt));
  };

  // Filter static options
  const filterStaticOptions = React.useCallback(
    (query: string): AutocompleteOption[] => {
      if (!query || query.length < minChars) {
        return [];
      }

      const normalizedOptions = normalizeOptions(options);
      return normalizedOptions
        .filter(
          (option) =>
            option.label.toLowerCase().includes(query.toLowerCase()) ||
            option.value.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, maxResults);
    },
    [minChars, options, maxResults],
  );

  // Handle async options
  const fetchAsyncOptions = React.useCallback(
    async (query: string) => {
      if (!asyncOptions || query.length < minChars) {
        return;
      }

      setIsLoading(true);
      try {
        const results = await asyncOptions(query);
        const normalizedResults = normalizeOptions(results);
        setFilteredOptions(normalizedResults.slice(0, maxResults));
      } catch (error) {
        console.error('Autocomplete async options error:', error);
        setFilteredOptions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [asyncOptions, minChars, maxResults],
  );

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (asyncOptions) {
        fetchAsyncOptions(inputValue);
      } else {
        setFilteredOptions(filterStaticOptions(inputValue));
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [inputValue, asyncOptions, debounceMs, fetchAsyncOptions, filterStaticOptions]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setInputValue(value);
    setIsOpen(true);
    setHighlightedIndex(-1);

    if (allowCustom) {
      fieldApi.handleChange(value);
    }
  };

  // Handle option selection
  const handleOptionSelect = (option: AutocompleteOption) => {
    setInputValue(option.label);
    fieldApi.handleChange(option.value);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        return;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleOptionSelect(filteredOptions[highlightedIndex]);
        } else if (allowCustom && inputValue) {
          fieldApi.handleChange(inputValue);
          setIsOpen(false);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Handle focus/blur
  const handleFocus = () => {
    if (inputValue.length >= minChars) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Delay closing to allow option clicks
    setTimeout(() => {
      if (!listRef.current?.contains(document.activeElement)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }, 150);
  };

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [highlightedIndex]);

  const showDropdown =
    isOpen &&
    (filteredOptions.length > 0 || isLoading || (inputValue.length >= minChars && !isLoading));

  const isDisabled = fieldApi.form.state.isSubmitting;

  return (
    <FieldWrapper fieldApi={fieldApi} {...wrapperProps}>
      <div className="relative">
        <Input
          ref={inputRef}
          autoComplete="off"
          className={cn(inputClassName, isOpen && 'rounded-b-none')}
          disabled={isDisabled}
          id={fieldApi.name}
          name={fieldApi.name}
          placeholder={placeholder || autocompleteConfig.placeholder || 'Type to search...'}
          value={inputValue}
          onBlur={() => {
            handleInputBlur();
            fieldApi.handleBlur();
          }}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        />

        {showDropdown ? (
          <Card className="absolute top-full right-0 left-0 z-50 max-h-60 overflow-y-auto rounded-t-none border-t-0">
            <div ref={listRef} className="p-1">
              {isLoading ? (
                <div className="text-muted-foreground px-3 py-2 text-sm">{loadingText}</div>
              ) : null}

              {!isLoading && filteredOptions.length === 0 && inputValue.length >= minChars && (
                <div className="text-muted-foreground px-3 py-2 text-sm">
                  {noOptionsText}
                  {allowCustom ? (
                    <Button
                      className="ml-2 h-auto p-1 text-xs"
                      disabled={isDisabled}
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        fieldApi.handleChange(inputValue);
                        setIsOpen(false);
                      }}
                    >
                      Use "{inputValue}"
                    </Button>
                  ) : null}
                </div>
              )}

              {!isLoading &&
                filteredOptions.map((option, index) => (
                  <button
                    key={`${option.value}-${index}`}
                    className={cn(
                      'w-full rounded-sm px-3 py-2 text-left text-sm transition-colors',
                      'hover:bg-muted focus:bg-muted focus:outline-none',
                      highlightedIndex === index && 'bg-muted',
                    )}
                    disabled={isDisabled}
                    type="button"
                    onClick={() => {
                      handleOptionSelect(option);
                    }}
                    onMouseEnter={() => {
                      setHighlightedIndex(index);
                    }}
                  >
                    <div className="font-medium">{option.label}</div>
                    {option.value !== option.label && (
                      <div className="text-muted-foreground text-xs">{option.value}</div>
                    )}
                  </button>
                ))}
            </div>
          </Card>
        ) : null}
      </div>
    </FieldWrapper>
  );
};
