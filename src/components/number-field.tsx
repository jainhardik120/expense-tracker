'use client';
import type React from 'react';

import { Input } from '@/components/ui/input';
import type { NumberFieldSpecificProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { FieldWrapper } from './base-field-wrapper';

export const NumberField: React.FC<NumberFieldSpecificProps> = ({
  fieldApi,
  label,
  description,
  placeholder,
  inputClassName,
  labelClassName,
  wrapperClassName,
  min,
  max,
  step,
}) => {
  const { name } = fieldApi;
  const value = fieldApi.state?.value as number | string | undefined;
  const isDisabled = fieldApi.form?.state?.isSubmitting ?? false;
  const hasErrors = fieldApi.state?.meta?.isTouched && fieldApi.state?.meta?.errors?.length > 0;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    let parsedValue: number | string | undefined;

    if (val === '') {
      parsedValue = undefined;
    } else {
      const num = parseFloat(val);
      parsedValue = isNaN(num) ? val : num;
    }

    fieldApi.handleChange(parsedValue);
  };

  const onBlur = () => {
    fieldApi.handleBlur();
  };

  let displayValue: string | number = '';
  if (typeof value === 'number') {
    displayValue = value;
  } else if (typeof value === 'string') {
    displayValue = value;
  }

  const computedInputClassName = cn(inputClassName, hasErrors ? 'border-destructive' : '');

  return (
    <FieldWrapper
      description={description}
      fieldApi={fieldApi}
      inputClassName={inputClassName}
      label={label}
      labelClassName={labelClassName}
      wrapperClassName={wrapperClassName}
    >
      <Input
        className={computedInputClassName}
        disabled={isDisabled}
        id={name}
        max={max}
        min={min}
        name={name}
        placeholder={placeholder}
        step={step}
        type="number"
        value={displayValue}
        onBlur={onBlur}
        onChange={onChange}
      />
    </FieldWrapper>
  );
};
