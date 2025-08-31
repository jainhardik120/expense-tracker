'use client';

import { useState } from 'react';

import { type DefaultValues, type FieldValues } from 'react-hook-form';
import { toast } from 'sonner';
import { type z } from 'zod';

import DynamicForm from '@/components/dynamic-form';
import { type FormField } from '@/components/dynamic-form-fields';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import type * as z4 from 'zod/v4/core';

type Props<Input extends FieldValues, Output, MutationResult> = {
  schema: z4.$ZodType<Output, Input>;
  mutation: { mutateAsync: (values: Output) => Promise<MutationResult>; isPending: boolean };
  defaultValues: DefaultValues<z.infer<z4.$ZodType<Output, Input>>>;
  fields: Array<FormField<Input>>;
  button: React.ReactNode;
  titleText?: string;
  refresh?: () => void;
  successToast: (mutationResult: MutationResult) => string;
};

const MutationModal = <T extends FieldValues, MutationResult>(
  props: Props<T, T, MutationResult>,
) => {
  const [open, setOpen] = useState(false);
  const onSubmit = (values: z.infer<typeof props.schema>) => {
    props.mutation
      .mutateAsync(values)
      .then((result) => {
        toast(props.successToast(result));
        setOpen(false);
        return props.refresh?.();
      })
      .catch((err) => {
        setOpen(false);
        toast.error(err instanceof Error ? err.message : String(err));
      });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{props.button}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{props.titleText}</DialogTitle>
        </DialogHeader>
        <DynamicForm
          defaultValues={props.defaultValues}
          fields={props.fields}
          schema={props.schema}
          showSubmitButton
          submitButtonDisabled={props.mutation.isPending}
          submitButtonText="Save"
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
};

export default MutationModal;
