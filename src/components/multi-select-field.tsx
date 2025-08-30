'use client';
import type React from 'react';
import { useState, useRef, useEffect } from 'react';

import { X, ChevronDown, Check } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MultiSelectFieldSpecificProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { FieldWrapper } from './base-field-wrapper';

export const MultiSelectField: React.FC<MultiSelectFieldSpecificProps> = ({
  fieldApi,
  options = [],
  multiSelectConfig = {},

  ...wrapperProps
}) => {
  const {
    maxSelections = Infinity,
    searchable = true,
    creatable = false,
    placeholder = 'Select options...',
    noOptionsText = 'No options found',
  } = multiSelectConfig;

  const selectedValues = Array.isArray(fieldApi.state?.value) ? fieldApi.state?.value : [];

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedOptions = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );

  // Filter options based on search query
  const filteredOptions = normalizedOptions.filter(
    (option) =>
      option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      option.value.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Add create option if enabled and query doesn't match existing options
  const canCreate =
    creatable &&
    searchQuery.trim() &&
    !normalizedOptions.some(
      (opt) =>
        opt.value.toLowerCase() === searchQuery.toLowerCase() ||
        opt.label.toLowerCase() === searchQuery.toLowerCase(),
    ) &&
    !selectedValues.includes(searchQuery.trim());

  const displayOptions = [...filteredOptions];
  if (canCreate) {
    displayOptions.unshift({
      value: searchQuery.trim(),
      label: `Create "${searchQuery.trim()}"`,
      isCreateOption: true,
    } as { value: string; label: string; isCreateOption: true });
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (optionValue: string) => {
    if (selectedValues.includes(optionValue)) {
      // Remove if already selected
      const newValues = selectedValues.filter((v) => v !== optionValue);
      fieldApi.handleChange(newValues);
    } else if (selectedValues.length < maxSelections) {
      // Add if not at max selections
      const newValues = [...selectedValues, optionValue];
      fieldApi.handleChange(newValues);
    }

    setSearchQuery('');
    if (!searchable) {
      setIsOpen(false);
    }
    inputRef.current?.focus();
  };

  const handleRemove = (valueToRemove: string) => {
    const newValues = selectedValues.filter((v) => v !== valueToRemove);
    fieldApi.handleChange(newValues);
    fieldApi.handleBlur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !searchQuery && selectedValues.length > 0) {
      // Remove last selected item on backspace
      handleRemove(selectedValues[selectedValues.length - 1]);
    } else if (e.key === 'Enter' && canCreate) {
      e.preventDefault();
      handleSelect(searchQuery.trim());
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  const getSelectedLabels = () => {
    return selectedValues.map((value) => {
      const option = normalizedOptions.find((opt) => opt.value === value);
      return option ? option.label : value;
    });
  };

  const isDisabled = fieldApi.form.state.isSubmitting;

  return (
    <FieldWrapper fieldApi={fieldApi} {...wrapperProps}>
      <div ref={containerRef} className="space-y-2">
        {wrapperProps.label && maxSelections < Infinity ? (
          <div className="text-muted-foreground text-sm">
            ({selectedValues.length}/{maxSelections})
          </div>
        ) : null}

        <div className="relative">
          {/* Selected items display */}
          <div
            className={cn(
              'border-input bg-background ring-offset-background min-h-10 w-full rounded-md border px-3 py-2 text-sm',
              'focus-within:ring-ring focus-within:ring-2 focus-within:ring-offset-2',
              fieldApi.state?.meta?.errors.length ? 'border-destructive' : '',
              isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-text',
            )}
            onClick={() => {
              if (!isDisabled) {
                setIsOpen(true);
                inputRef.current?.focus();
              }
            }}
          >
            <div className="flex flex-wrap items-center gap-1">
              {/* Selected tags */}
              {selectedValues.map((value, index) => {
                const label = getSelectedLabels()[index];
                return (
                  <Badge key={value} className="h-6 gap-1 px-2 text-xs" variant="secondary">
                    {label}
                    <Button
                      className="hover:bg-destructive hover:text-destructive-foreground h-3 w-3 p-0"
                      disabled={isDisabled}
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(value);
                      }}
                    >
                      <X className="h-2 w-2" />
                    </Button>
                  </Badge>
                );
              })}

              {/* Search input */}
              {searchable ? (
                <Input
                  ref={inputRef}
                  className="h-6 border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  disabled={isDisabled || selectedValues.length >= maxSelections}
                  placeholder={selectedValues.length === 0 ? placeholder : ''}
                  value={searchQuery}
                  onBlur={fieldApi.handleBlur}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                  }}
                  onFocus={() => {
                    setIsOpen(true);
                  }}
                  onKeyDown={handleKeyDown}
                />
              ) : null}

              {/* Dropdown indicator */}
              <ChevronDown
                className={cn(
                  'text-muted-foreground ml-auto h-4 w-4 transition-transform',
                  isOpen ? 'rotate-180' : '',
                )}
              />
            </div>
          </div>

          {/* Dropdown */}
          {isOpen ? (
            <div className="bg-popover absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border shadow-lg">
              {displayOptions.length === 0 ? (
                <div className="text-muted-foreground p-2 text-center text-sm">{noOptionsText}</div>
              ) : (
                displayOptions.map(
                  (
                    option: {
                      value: string;
                      label: string;
                      isCreateOption?: boolean;
                    },
                    index,
                  ) => {
                    const isSelected = selectedValues.includes(option.value);
                    const isDisabled = !isSelected && selectedValues.length >= maxSelections;

                    return (
                      <button
                        key={`${option.value}-${index}`}
                        className={cn(
                          'hover:bg-accent hover:text-accent-foreground w-full px-3 py-2 text-left text-sm',
                          'flex items-center justify-between',
                          isSelected ? 'bg-accent' : '',
                          isDisabled ? 'cursor-not-allowed opacity-50' : '',
                          option.isCreateOption ? 'text-primary font-medium' : '',
                        )}
                        disabled={isDisabled}
                        type="button"
                        onClick={() => !isDisabled && handleSelect(option.value)}
                      >
                        <span>{option.label}</span>
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  },
                )
              )}
            </div>
          ) : null}
        </div>
      </div>
    </FieldWrapper>
  );
};
