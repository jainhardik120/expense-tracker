'use client';

import * as React from 'react';

import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface AutocompleteOption {
  value: string;
  label: string;
}

export interface AutocompleteProps {
  options: AutocompleteOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  allowCustomValue?: boolean;
}

const Autocomplete = ({
  options,
  value = '',
  onValueChange,
  placeholder = 'Select or type...',
  emptyMessage = 'No results found.',
  disabled = false,
  className,
  allowCustomValue = true,
}: AutocompleteProps) => {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState('');
  const [internalValue, setInternalValue] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setInternalValue(value);
  }, [value]);

  const filteredOptions = React.useMemo(() => {
    if (searchValue === '') {
      return options;
    }

    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(searchValue.toLowerCase()) ||
        option.value.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [options, searchValue]);

  const displayLabel = React.useMemo(() => {
    const option = options.find((opt) => opt.value === internalValue);
    return option?.label ?? internalValue;
  }, [internalValue, options]);

  const handleSelect = (selectedValue: string) => {
    const newValue = selectedValue === internalValue ? '' : selectedValue;
    setInternalValue(newValue);
    onValueChange?.(newValue);
    setOpen(false);
    setSearchValue('');
  };

  const handleSearchChange = (search: string) => {
    setSearchValue(search);

    if (allowCustomValue) {
      setInternalValue(search);
      onValueChange?.(search);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && allowCustomValue && searchValue !== '') {
      setInternalValue(searchValue);
      onValueChange?.(searchValue);
      setOpen(false);
      setSearchValue('');
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      // Focus the input when opening
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      setSearchValue('');
    }
  };

  const handleButtonClick = () => {
    setOpen(true);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          onClick={handleButtonClick}
          className={cn(
            'w-full justify-between font-normal',
            internalValue === '' && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{internalValue === '' ? placeholder : displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false} onKeyDown={handleKeyDown}>
          <CommandInput
            ref={inputRef}
            placeholder={placeholder}
            value={searchValue}
            onValueChange={handleSearchChange}
          />
          <CommandList>
            <CommandEmpty>
              {allowCustomValue && searchValue !== '' ? (
                <div className="px-2 py-1.5 text-sm">
                  Press Enter to use &quot;{searchValue}&quot;
                </div>
              ) : (
                emptyMessage
              )}
            </CommandEmpty>
            {filteredOptions.length > 0 && (
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      handleSelect(option.value);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        internalValue === option.value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export { Autocomplete };
