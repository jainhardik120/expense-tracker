'use client';

import { type ReactNode, type Ref, useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type DeepPartial,
  useForm,
  type UseFormReturn,
  type FieldValues,
  type DefaultValues,
} from 'react-hook-form';
import { type z } from 'zod';

import { type FormField, RenderFormInput } from '@/components/dynamic-form/dynamic-form-fields';
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
              <FormItem>
                <FormLabel>{field.label}</FormLabel>
                <FormControl>
                  <RenderFormInput field={formField} formField={field} type={field.type} />
                </FormControl>
                {field.description !== undefined && (
                  <FormDescription>{field.description}</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        {props.FormFooter === undefined ? null : <props.FormFooter form={form} />}
        {props.showSubmitButton === true && (
          <Button disabled={props.submitButtonDisabled} type="submit">
            {props.submitButtonText ?? 'Submit'}
          </Button>
        )}
      </form>
    </Form>
  );
};

export default DynamicForm;
