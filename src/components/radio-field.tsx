'use client';
import type React from 'react';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { RadioFieldSpecificProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { FieldWrapper } from './base-field-wrapper';

export const RadioField: React.FC<RadioFieldSpecificProps> = ({
  fieldApi,
  label,
  description,
  inputClassName,
  labelClassName,
  wrapperClassName,
  options = [],
  direction = 'vertical',
}) => {
  const { name } = fieldApi;
  const value = fieldApi.state?.value as string | undefined;
  const isDisabled = fieldApi.form?.state?.isSubmitting ?? false;
  const hasErrors = fieldApi.state?.meta?.isTouched && fieldApi.state?.meta?.errors?.length > 0;

  const normalizedOptions = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );

  const onValueChange = (value: string) => {
    fieldApi.handleChange(value);
  };

  const onBlur = () => {
    fieldApi.handleBlur();
  };

  return (
    <FieldWrapper
      description={description}
      fieldApi={fieldApi}
      inputClassName={inputClassName}
      label={label}
      labelClassName={labelClassName}
      wrapperClassName={wrapperClassName}
    >
      <RadioGroup
        className={cn(
          direction === 'horizontal' ? 'flex flex-wrap gap-6' : 'flex flex-col space-y-2',
          inputClassName,
        )}
        disabled={isDisabled}
        value={value || ''}
        onBlur={onBlur}
        onValueChange={onValueChange}
      >
        {normalizedOptions.map((option, index) => (
          <div key={`${option.value}-${index}`} className="flex items-center space-x-2">
            <RadioGroupItem
              className={cn(hasErrors ? 'border-destructive' : '')}
              id={`${name}-${option.value}`}
              value={option.value}
            />
            <Label
              className="cursor-pointer text-sm font-normal"
              htmlFor={`${name}-${option.value}`}
            >
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </FieldWrapper>
  );
};
