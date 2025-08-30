import type React from 'react';

import { PaperclipIcon, XIcon, UploadCloudIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BaseFieldProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { FieldWrapper } from './base-field-wrapper';

interface FileUploadFieldSpecificProps extends BaseFieldProps {
  accept?: string;
  className?: string;
}

export const FileUploadField: React.FC<FileUploadFieldSpecificProps> = ({
  fieldApi,
  label,
  description,
  inputClassName,
  labelClassName,
  wrapperClassName,
  accept,
  className,
}) => {
  const { name } = fieldApi;
  const isDisabled = fieldApi.form?.state?.isSubmitting ?? false;
  const hasErrors = fieldApi.state?.meta?.isTouched && fieldApi.state?.meta?.errors?.length > 0;

  const file = fieldApi.state?.value as File | null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] ?? null;
    fieldApi.handleChange(selectedFile);
    fieldApi.handleBlur();
  };

  const handleRemoveFile = () => {
    fieldApi.handleChange(null);
    const inputElement = document.getElementById(name) as HTMLInputElement;
    if (inputElement) {
      inputElement.value = '';
    }
    fieldApi.handleBlur();
  };

  const triggerFileInput = () => {
    const inputElement = document.getElementById(name) as HTMLInputElement;
    inputElement?.click();
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
      <div className="space-y-1.5">
        <Input
          accept={accept}
          className="hidden"
          disabled={isDisabled}
          id={name}
          name={name}
          type="file"
          onChange={handleFileChange}
        />
        {file ? (
          <div className="bg-muted/40 flex items-center justify-between rounded-lg border p-2.5 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-2 overflow-hidden text-sm">
              <PaperclipIcon className="text-primary h-5 w-5 shrink-0" />
              <span className="truncate" title={file.name}>
                {file.name}
              </span>
              <span className="text-muted-foreground text-xs whitespace-nowrap">
                ({(file.size / 1024).toFixed(1)} KB)
              </span>
            </div>
            <Button
              aria-label="Remove file"
              className="text-destructive hover:bg-destructive/10 h-7 w-7 shrink-0"
              disabled={isDisabled}
              size="icon"
              type="button"
              variant="ghost"
              onClick={handleRemoveFile}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            className={cn(
              'hover:border-primary bg-background hover:bg-muted/50 flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors',
              className,
              hasErrors
                ? 'border-destructive hover:border-destructive'
                : 'border-muted-foreground/50',
              isDisabled && 'cursor-not-allowed opacity-50',
            )}
            disabled={isDisabled}
            type="button"
            onClick={triggerFileInput}
          >
            <UploadCloudIcon className="text-muted-foreground mb-2 h-8 w-8" />
            <span className="text-muted-foreground text-sm font-medium">
              Click or drag and drop a file
            </span>
            {accept ? (
              <span className="text-muted-foreground/80 mt-1 text-xs">
                Accepted types: {accept}
              </span>
            ) : null}
          </button>
        )}
      </div>
    </FieldWrapper>
  );
};
