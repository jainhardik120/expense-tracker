'use client';

import { useState } from 'react';

import { type FieldValues } from 'react-hook-form';
import { toast } from 'sonner';
import { type z } from 'zod';

import DynamicForm, { type DynamicFormProps } from '@/components/dynamic-form/dynamic-form';

import Modal from './modal';

type Props<Input extends FieldValues, Output extends FieldValues, MutationResult> = Omit<
  DynamicFormProps<Input, Output>,
  'showSubmitButton'
> & {
  mutation: { mutateAsync: (values: Output) => Promise<MutationResult>; isPending: boolean };
  button: React.ReactNode;
  titleText?: string;
  refresh?: (values: MutationResult) => Promise<void> | void;
  successToast: (mutationResult: MutationResult) => string;
  customDescription?: React.ReactNode;
};

const MutationModal = <T extends FieldValues, U extends FieldValues, MutationResult>(
  props: Props<T, U, MutationResult>,
) => {
  const [open, setOpen] = useState(false);
  const onSubmit = (values: z.infer<typeof props.schema>) => {
    props.mutation
      .mutateAsync(values)
      .then((result) => {
        toast(props.successToast(result));
        setOpen(false);
        return props.refresh?.(result);
      })
      .catch((err) => {
        setOpen(false);
        toast.error(err instanceof Error ? err.message : String(err));
      });
  };
  return (
    <Modal open={open} setOpen={setOpen} title={props.titleText} trigger={props.button}>
      {props.customDescription}
      <DynamicForm {...props} showSubmitButton onSubmit={onSubmit} />
    </Modal>
  );
};

export default MutationModal;
