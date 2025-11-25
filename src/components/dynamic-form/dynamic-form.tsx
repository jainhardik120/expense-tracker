'use client';

import { type ReactNode, type Ref, useEffect, useId } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type DeepPartial,
  useForm,
  type UseFormReturn,
  type FieldValues,
  type DefaultValues,
} from 'react-hook-form';
import { type z } from 'zod';

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

type Props<Input extends FieldValues, Output> = {
  schema: z4.$ZodType<Output, Input>;
  onSubmit: (values: Output) => Promise<void> | void;
  defaultValues: DefaultValues<z.infer<z4.$ZodType<Output, Input>>>;
  fields: Array<FormField<Input>>;
  submitButtonText?: string;
  submitButtonDisabled?: boolean;
  FormFooter?: ({ form }: { form: UseFormReturn<Input, unknown, Input> }) => ReactNode;
  onValuesChange?: (values: DeepPartial<Output>) => void;
  showSubmitButton?: boolean;
  ref?: Ref<UseFormReturn<Input, unknown, Output>>;
  className?: string;
};

const DynamicForm = <T extends FieldValues>(props: Props<T, T>) => {
  const { onValuesChange, defaultValues } = props;
  type FormData = T;

  const form = useForm<FormData>({
    resolver: zodResolver(props.schema),
    defaultValues: props.defaultValues,
  });

  if (props.ref !== undefined && props.ref !== null) {
    if (typeof props.ref === 'function') {
      props.ref(form);
    } else {
      props.ref.current = form;
    }
  }

  useEffect(() => {
    const subscription = form.watch((values) => {
      if (onValuesChange !== undefined) {
        onValuesChange(values);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [form, onValuesChange]);

  useEffect(() => {
    form.reset({
      ...defaultValues,
    });
  }, [defaultValues, form]);
  const formId = useId();
  return (
    <Form {...form}>
      <form
        className={cn('grid gap-4', props.className)}
        onSubmit={form.handleSubmit(props.onSubmit)}
      >
        {props.fields.map((field) => (
          <FormFieldPrimitive
            key={field.name}
            control={form.control}
            name={field.name}
            render={({ field: formField }) => (
              <FormItem className={cn(`${field.type === RenderLabelAfter ? 'flex flex-row' : ''}`)}>
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
        ))}
        {props.showSubmitButton === true && (
          <Button disabled={props.submitButtonDisabled} type="submit">
            {props.submitButtonText ?? 'Submit'}
          </Button>
        )}
        {props.FormFooter === undefined ? null : <props.FormFooter form={form} />}
      </form>
    </Form>
  );
};

export default DynamicForm;
