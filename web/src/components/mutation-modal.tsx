'use client';

import { useState } from 'react';

import { type FieldValues } from 'react-hook-form';
import { toast } from 'sonner';

import DynamicForm, { type DynamicFormProps } from '@/components/dynamic-form/dynamic-form';
import { errorMessage } from '@/lib/utils';

import Modal from './modal';

type Mutation<Input, Result> = {
  mutateAsync: (values: Input) => Promise<Result>;
  isPending: boolean;
};

type MutationProps<Output, MutationInput, MutationResult> =
  | { mutation: Mutation<NoInfer<Output>, MutationResult>; mapInput?: never }
  | {
      mutation: Mutation<MutationInput, MutationResult>;
      mapInput: (values: NoInfer<Output>) => MutationInput;
    };

type Props<
  Input extends FieldValues,
  Output extends FieldValues,
  MutationInput,
  MutationResult,
> = Omit<DynamicFormProps<Input, Output>, 'showSubmitButton'> &
  MutationProps<Output, MutationInput, MutationResult> & {
    button: React.ReactNode;
    titleText?: string;
    refresh?: (values: MutationResult) => Promise<void> | void;
    successToast: (mutationResult: MutationResult) => string;
    customDescription?: React.ReactNode;
    modalDescription?: React.ReactNode;
    modalClassName?: string;
  };

const submit = <Output, MutationInput, MutationResult>(
  props: MutationProps<Output, MutationInput, MutationResult>,
  values: Output,
) =>
  props.mapInput === undefined
    ? props.mutation.mutateAsync(values)
    : props.mutation.mutateAsync(props.mapInput(values));

const MutationModal = <T extends FieldValues, U extends FieldValues, MutationInput, MutationResult>(
  props: Props<T, U, MutationInput, MutationResult>,
) => {
  const [open, setOpen] = useState(false);
  const onSubmit = (values: U) => {
    submit(props, values)
      .then((result) => {
        toast(props.successToast(result));
        setOpen(false);
        return props.refresh?.(result);
      })
      .catch((err) => {
        setOpen(false);
        toast.error(errorMessage(err));
      });
  };
  return (
    <Modal
      className={props.modalClassName}
      description={props.modalDescription}
      open={open}
      setOpen={setOpen}
      title={props.titleText}
      trigger={props.button}
    >
      {props.customDescription}
      <DynamicForm {...props} showSubmitButton onSubmit={onSubmit} />
    </Modal>
  );
};

export default MutationModal;
