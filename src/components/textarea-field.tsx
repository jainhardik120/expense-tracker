import type React from 'react';

import { Textarea } from '@/components/ui/textarea';
import type { TextareaFieldSpecificProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { FieldWrapper } from './base-field-wrapper';

export const TextareaField: React.FC<TextareaFieldSpecificProps> = ({
  fieldApi,
  label,
  description,
  placeholder,
  inputClassName,
  labelClassName,
  wrapperClassName,
  rows = 3,
}) => {
  const { name } = fieldApi;
  const value = (fieldApi.state?.value as string) || '';
  const isDisabled = fieldApi.form?.state?.isSubmitting ?? false;
  const hasErrors = fieldApi.state?.meta?.isTouched && fieldApi.state?.meta?.errors?.length > 0;

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    fieldApi.handleChange(e.target.value);
  };

  const onBlur = () => {
    fieldApi.handleBlur();
  };

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
      <Textarea
        className={computedInputClassName}
        disabled={isDisabled}
        id={name}
        name={name}
        placeholder={placeholder}
        rows={rows}
        value={value}
        onBlur={onBlur}
        onChange={onChange}
      />
    </FieldWrapper>
  );
};
