'use client';

import { type ReactNode, type Ref, useEffect, useId, useImperativeHandle, useRef } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  useForm,
  useWatch,
  type UseFormReturn,
  type FieldValues,
  type DefaultValues,
} from 'react-hook-form';

import {
  type FormField,
  RenderFormInput,
  RenderLabelAfter,
} from '@/components/dynamic-form/dynamic-form-fields';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
  FormField as FormFieldPrimitive,
} from '@/components/ui/form';
import { cn } from '@/lib/utils';

import type * as z4 from 'zod/v4/core';

export type DynamicFormProps<Input extends FieldValues, Output extends FieldValues> = {
  schema: z4.$ZodType<Output, Input>;
  onSubmit?: (values: Output) => Promise<void> | void;
  defaultValues: DefaultValues<Input>;
  fields: Array<FormField<Input>>;
  submitButtonText?: string;
  submitButtonDisabled?: boolean;
  FormFooter?: ({ form }: { form: UseFormReturn<Input, unknown, Output> }) => ReactNode;
  showSubmitButton?: boolean;
  ref?: Ref<UseFormReturn<Input, unknown, Output>>;
  className?: string;
  submissionError?: string;
};

const DynamicForm = <T extends FieldValues, U extends FieldValues>({
  schema,
  onSubmit,
  defaultValues,
  fields,
  submitButtonText,
  submitButtonDisabled,
  FormFooter,
  showSubmitButton,
  ref,
  className,
}: DynamicFormProps<T, U>) => {
  const form = useForm<T, unknown, U>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useImperativeHandle(ref, () => form, [form]);
  const prevDefaultValuesRef = useRef<string>('');

  useEffect(() => {
    const serializedValues = JSON.stringify(defaultValues);
    if (prevDefaultValuesRef.current !== serializedValues) {
      prevDefaultValuesRef.current = serializedValues;
      form.reset({
        ...defaultValues,
      });
    }
  }, [defaultValues, form]);
  const onFormSubmit = onSubmit === undefined ? undefined : form.handleSubmit(onSubmit);
  // useWatch rather than form.watch(): watch() returns a fresh function the React
  // Compiler cannot memoize, so it bails out of optimising this whole component.
  const values = useWatch({ control: form.control }) as T;
  const formId = useId();
  return (
    <Form {...form}>
      <form className={cn('grid gap-4')} onSubmit={onFormSubmit}>
        {/*
          Deliberately not capped or scrollable. Whatever this form is inside
          owns the scrolling: a dialog and a drawer both bound themselves to the
          viewport and scroll their own contents, and a page scrolls anyway.
          Capping here as well produced two nested scrollbars -- the fields
          scrolled to their end first, and only then did the modal scroll and
          take the heading with it -- and, because the cap was measured against
          the viewport rather than against the space actually left inside the
          modal, the sum of header plus 70vh plus footer overflowed the modal and
          pushed the submit button out of reach.
        */}
        <div className={cn('grid gap-4 p-1', className)}>
          {fields.map((field) => {
            const { displayCondition = true } = field;
            if (
              displayCondition === false ||
              (typeof displayCondition === 'function' && !displayCondition(values))
            ) {
              return null;
            }
            return (
              <FormFieldPrimitive
                key={field.name}
                control={form.control}
                name={field.name}
                render={({ field: formField }) => (
                  <FormItem
                    className={cn(
                      `${field.type === RenderLabelAfter ? 'flex flex-row' : 'min-w-0'}`,
                    )}
                  >
                    {field.type !== RenderLabelAfter &&
                      (typeof field.label === 'string' ? (
                        <FormLabel htmlFor={`${formId}-${field.name}`}>{field.label}</FormLabel>
                      ) : (
                        field.label
                      ))}
                    <FormControl>
                      <RenderFormInput
                        field={formField}
                        formField={field}
                        id={`${formId}-${field.name}`}
                        type={field.type}
                      />
                    </FormControl>
                    {field.type === RenderLabelAfter &&
                      (typeof field.label === 'string' ? (
                        <FormLabel htmlFor={`${formId}-${field.name}`}>{field.label}</FormLabel>
                      ) : (
                        field.label
                      ))}
                    {field.description !== undefined && (
                      <FormDescription>{field.description}</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            );
          })}
        </div>

        {showSubmitButton === true && (
          <Button className="mx-1" disabled={submitButtonDisabled} type="submit">
            {submitButtonText ?? 'Submit'}
          </Button>
        )}
        {FormFooter === undefined ? null : (
          <div className="mx-1 grid gap-4">
            <FormFooter form={form} />
          </div>
        )}
      </form>
    </Form>
  );
};

export default DynamicForm;
