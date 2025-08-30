import type React from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { BaseFieldProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { FieldWrapper } from './base-field-wrapper';

export const CheckboxField: React.FC<BaseFieldProps> = ({
  fieldApi,
  label,
  description,
  inputClassName,
  labelClassName,
  wrapperClassName,
}) => {
  const { name } = fieldApi;
  const value = fieldApi.state?.value as boolean | undefined;
  const isDisabled = fieldApi.form?.state?.isSubmitting ?? false;

  const onCheckedChange = (checked: boolean) => {
    fieldApi.handleChange(checked);
  };

  const onBlur = () => {
    fieldApi.handleBlur();
  };

  return (
    // Note: We pass label={undefined} to FieldWrapper and render the label manually
    // because Checkbox components need the label positioned next to (not above) the control
    <FieldWrapper
      description={description}
      fieldApi={fieldApi}
      inputClassName={inputClassName}
      label={undefined}
      labelClassName={labelClassName}
      wrapperClassName={wrapperClassName}
    >
      <div className="flex items-center space-x-2">
        <Checkbox
          aria-describedby={description ? `${name}-description` : undefined}
          checked={!!value}
          disabled={isDisabled}
          id={name}
          onBlur={onBlur}
          onCheckedChange={onCheckedChange}
        />
        {label ? (
          <Label
            className={cn(
              'text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
              labelClassName,
            )}
            htmlFor={name}
          >
            {label}
          </Label>
        ) : null}
      </div>
    </FieldWrapper>
  );
};
