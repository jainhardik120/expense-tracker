'use client';
import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { Input } from '@/components/ui/input';
import type { TextFieldSpecificProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { FieldWrapper } from './base-field-wrapper';

export const TextField: React.FC<TextFieldSpecificProps> = ({
  fieldApi,
  label,
  description,
  placeholder,
  inputClassName,
  labelClassName,
  wrapperClassName,
  type = 'text',
  datalist,
}) => {
  const { name } = fieldApi;
  const value = fieldApi.state?.value as string | number | undefined;
  const isDisabled = fieldApi.form?.state?.isSubmitting ?? false;
  const hasErrors = fieldApi.state?.meta?.isTouched && fieldApi.state?.meta?.errors?.length > 0;

  // Datalist state
  const [datalistOptions, setDatalistOptions] = useState<string[]>(datalist?.options || []);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [lastQuery, setLastQuery] = useState('');

  // Debounced async options fetching
  const fetchAsyncOptions = useCallback(
    async (query: string) => {
      if (!datalist?.asyncOptions) {
        return;
      }

      const minChars = datalist.minChars || 1;
      if (query.length < minChars) {
        setDatalistOptions(datalist.options || []);
        return;
      }

      if (query === lastQuery) {
        return;
      }

      setIsLoadingOptions(true);
      setLastQuery(query);

      try {
        const results = await datalist.asyncOptions(query);
        const maxResults = datalist.maxResults || 10;
        const limitedResults = results.slice(0, maxResults);

        // Combine static options with async results
        const staticOptions = datalist.options || [];
        const combinedOptions = [...staticOptions, ...limitedResults];

        // Remove duplicates
        const uniqueOptions = Array.from(new Set(combinedOptions));

        setDatalistOptions(uniqueOptions);
      } catch (error) {
        console.error('Error fetching datalist options:', error);
        // Fallback to static options on error
        setDatalistOptions(datalist.options || []);
      } finally {
        setIsLoadingOptions(false);
      }
    },
    [datalist, lastQuery],
  );

  // Debounced effect for async options
  useEffect(() => {
    if (!datalist?.asyncOptions) {
      return;
    }

    const debounceMs = datalist.debounceMs || 300;
    const currentValue = String(value || '');

    const timeoutId = setTimeout(() => {
      fetchAsyncOptions(currentValue);
    }, debounceMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [value, fetchAsyncOptions, datalist]);

  // Generate unique datalist id
  const datalistId = useMemo(() => (datalist ? `${name}-datalist` : undefined), [name, datalist]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    fieldApi.handleChange(e.target.value);
  };

  const onBlur = () => {
    fieldApi.handleBlur();
  };

  const computedInputClassName = cn(
    inputClassName,
    hasErrors ? 'border-destructive' : '',
    isLoadingOptions ? 'pr-8' : '',
  );

  return (
    <FieldWrapper
      description={description}
      fieldApi={fieldApi}
      inputClassName={inputClassName}
      label={label}
      labelClassName={labelClassName}
      wrapperClassName={wrapperClassName}
    >
      <div className="relative">
        <Input
          autoComplete={datalist ? 'off' : undefined}
          className={computedInputClassName}
          disabled={isDisabled}
          id={name}
          list={datalistId}
          name={name}
          placeholder={placeholder}
          type={type}
          value={value === undefined || value === null ? '' : String(value)}
          onBlur={onBlur}
          onChange={onChange}
        />
        {isLoadingOptions ? (
          <div className="absolute top-1/2 right-2 -translate-y-1/2 transform">
            <span className="text-muted-foreground text-xs">Loading...</span>
          </div>
        ) : null}
        {datalist && datalistOptions.length > 0 ? (
          <datalist id={datalistId}>
            {datalistOptions.map((option, index) => (
              <option key={`${option}-${index}`} value={option} />
            ))}
          </datalist>
        ) : null}
      </div>
    </FieldWrapper>
  );
};
