'use client';
import React from 'react';

import { resolveDynamicText } from '@/lib/template-interpolation';
import type { FieldComponentProps, FieldConfig } from '@/lib/types';

import { AutocompleteField } from './autocomplete-field';
import { CheckboxField } from './checkbox-field';
import { ColorPickerField } from './color-picker-field';
import { DateField } from './date-field';
import { DurationPickerField } from './duration-picker-field';
import { FileUploadField } from './file-upload-field';
import { LocationPickerField } from './location-picker-field';
import { MaskedInputField } from './masked-input-field';
import { MultiSelectField } from './multi-select-field';
import { NumberField } from './number-field';
import { PhoneField } from './phone-field';
import { RadioField } from './radio-field';
import { RatingField } from './rating-field';
import { SelectField } from './select-field';
import { SliderField } from './slider-field';
import { SwitchField } from './switch-field';
import { TextField } from './text-field';
import { TextareaField } from './textarea-field';

import type { AnyFieldApi, AnyFormApi } from '@tanstack/react-form';

export const FIELD_TYPE_COMPONENTS: Record<string, React.ComponentType<any>> = {
  text: TextField,
  email: TextField,
  password: TextField,
  url: TextField,
  tel: TextField,
  textarea: TextareaField,
  select: SelectField,
  checkbox: CheckboxField,
  switch: SwitchField,
  number: NumberField,
  date: DateField,
  slider: SliderField,
  file: FileUploadField,
  radio: RadioField,
  multiSelect: MultiSelectField,
  colorPicker: ColorPickerField,
  rating: RatingField,
  phone: PhoneField,
  location: LocationPickerField,
  duration: DurationPickerField,
  autocomplete: AutocompleteField,
  masked: MaskedInputField,
};

export const NestedFieldRenderer = <TFormValues extends Record<string, unknown>>({
  fieldConfig,
  fieldApi,
  form,
  currentValues,
  resolveOptions,
}: SharedFieldRendererProps<TFormValues>) => {
  const formState = form?.state;
  const safeValues: TFormValues = (currentValues ?? formState?.values ?? {}) as TFormValues;

  const [subscribedValues, setSubscribedValues] = React.useState<TFormValues>(safeValues);

  React.useEffect(() => {
    if (!form) {
      return;
    }
    return form.store.subscribe((state) => {
      setSubscribedValues((state as any).values as TFormValues);
    });
  }, [form]);

  const {
    type,
    label: rawLabel,
    placeholder: rawPlaceholder,
    description: rawDescription,
    options,
    component: CustomComponent,
    conditional,
    arrayConfig,
    datalist,
    ratingConfig,
    phoneConfig,
    colorConfig,
    multiSelectConfig,
    locationConfig,
    durationConfig,
    autocompleteConfig,
    maskedInputConfig,
    objectConfig,
    sliderConfig,
    numberConfig,
    dateConfig,
    fileConfig,
    textareaConfig,
    passwordConfig,
    emailConfig,
    min,
    max,
    step,
    accept,
    multiple,
  } = fieldConfig;

  const resolvedLabel = rawLabel ? resolveDynamicText(rawLabel, subscribedValues) : undefined;
  const resolvedPlaceholder = rawPlaceholder
    ? resolveDynamicText(rawPlaceholder, subscribedValues)
    : undefined;
  const resolvedDescription = rawDescription
    ? resolveDynamicText(rawDescription, subscribedValues)
    : undefined;

  if (conditional && !conditional(currentValues || subscribedValues)) {
    return null;
  }

  const renderActualField = () => {
    if (type === 'array') {
      const { ArrayField } = require('./array-field');
      return (
        <ArrayField
          arrayConfig={arrayConfig}
          description={resolvedDescription}
          fieldApi={fieldApi}
          label={resolvedLabel}
          placeholder={resolvedPlaceholder}
        />
      );
    }

    if (type === 'object') {
      const { ObjectField } = require('./object-field');
      return (
        <ObjectField
          description={resolvedDescription}
          fieldApi={fieldApi}
          form={form}
          label={resolvedLabel}
          objectConfig={objectConfig}
          placeholder={resolvedPlaceholder}
        />
      );
    }

    const FieldComponent = CustomComponent || FIELD_TYPE_COMPONENTS[type] || TextField;

    const resolvedOptionsList =
      options && resolveOptions
        ? resolveOptions(options, subscribedValues)
        : Array.isArray(options)
          ? options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt))
          : [];

    const baseProps: FieldComponentProps = {
      fieldApi,
      label: resolvedLabel,
      placeholder: resolvedPlaceholder,
      description: resolvedDescription,
      min,
      max,
      step,
      accept,
      multiple,
    };

    const props: FieldComponentProps = { ...baseProps };

    if (type === 'select' || type === 'radio' || type === 'multiSelect') {
      props.options = resolvedOptionsList;
    }

    if (['text', 'email', 'password', 'url', 'tel'].includes(type)) {
      props.type = type as any;
      props.datalist = datalist?.options;
    }

    if (type === 'rating') {
      props.ratingConfig = ratingConfig;
    }
    if (type === 'phone') {
      props.phoneConfig = phoneConfig;
    }
    if (type === 'colorPicker') {
      props.colorConfig = colorConfig;
    }
    if (type === 'multiSelect') {
      props.multiSelectConfig = multiSelectConfig;
    }
    if (type === 'location') {
      props.locationConfig = locationConfig;
    }
    if (type === 'duration') {
      props.durationConfig = durationConfig;
    }
    if (type === 'autocomplete') {
      props.autocompleteConfig =
        autocompleteConfig && resolveOptions
          ? {
              ...autocompleteConfig,
              options: resolveOptions(autocompleteConfig.options, subscribedValues),
            }
          : autocompleteConfig;
    }
    if (type === 'masked') {
      props.maskedInputConfig = maskedInputConfig;
    }
    if (type === 'slider') {
      props.sliderConfig = sliderConfig;
    }
    if (type === 'number') {
      props.numberConfig = numberConfig;
    }
    if (type === 'date') {
      props.dateConfig = dateConfig;
    }
    if (type === 'file') {
      props.fileConfig = fileConfig;
    }
    if (type === 'textarea') {
      props.textareaConfig = textareaConfig;
    }
    if (type === 'password') {
      props.passwordConfig = passwordConfig;
    }
    if (type === 'email') {
      props.emailConfig = emailConfig;
    }

    return <FieldComponent {...props} />;
  };

  return renderActualField();
};

export interface SharedFieldRendererProps<TFormValues extends Record<string, unknown>> {
  fieldConfig: FieldConfig & {
    crossFieldError?: string;
    asyncValidationState?: any;
    wrapperClassName?: string;
    labelClassName?: string;
    disabled?: boolean;
  };
  fieldApi: AnyFieldApi;
  form?: AnyFormApi;
  currentValues?: TFormValues;
  resolveOptions?: (
    options: FieldConfig['options'],
    currentValues: TFormValues,
  ) => { value: string; label: string }[];
}

export const SharedFieldRenderer = <TFormValues extends Record<string, unknown>>({
  fieldConfig,
  fieldApi,
  form,
  currentValues,
  resolveOptions,
}: SharedFieldRendererProps<TFormValues>) => {
  const formState = form?.state;
  const safeValues: TFormValues = (currentValues ?? formState?.values ?? {}) as TFormValues;

  const [subscribedValues, setSubscribedValues] = React.useState<TFormValues>(safeValues);

  React.useEffect(() => {
    if (!form) {
      return;
    }
    return form.store.subscribe((state) => {
      setSubscribedValues((state as any).values as TFormValues);
    });
  }, [form]);

  const {
    type,
    label: rawLabel,
    placeholder: rawPlaceholder,
    description: rawDescription,
    options,
    component: CustomComponent,
    conditional,
    datalist,
    ratingConfig,
    phoneConfig,
    colorConfig,
    multiSelectConfig,
    locationConfig,
    durationConfig,
    autocompleteConfig,
    maskedInputConfig,
    sliderConfig,
    numberConfig,
    dateConfig,
    fileConfig,
    textareaConfig,
    passwordConfig,
    emailConfig,
    min,
    max,
    step,
    accept,
    multiple,
  } = fieldConfig;

  const resolvedLabel = rawLabel ? resolveDynamicText(rawLabel, subscribedValues) : undefined;
  const resolvedPlaceholder = rawPlaceholder
    ? resolveDynamicText(rawPlaceholder, subscribedValues)
    : undefined;
  const resolvedDescription = rawDescription
    ? resolveDynamicText(rawDescription, subscribedValues)
    : undefined;

  if (conditional && !conditional(currentValues || subscribedValues)) {
    return null;
  }

  if (type === 'array' || type === 'object') {
    console.warn(
      `SharedFieldRenderer: ${type} fields should handle their own rendering to avoid circular dependencies`,
    );
    return null;
  }

  const FieldComponent = CustomComponent || FIELD_TYPE_COMPONENTS[type] || TextField;

  const resolvedOptionsList =
    options && resolveOptions
      ? resolveOptions(options, subscribedValues)
      : Array.isArray(options)
        ? options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt))
        : [];

  const baseProps: FieldComponentProps = {
    fieldApi,
    label: resolvedLabel,
    placeholder: resolvedPlaceholder,
    description: resolvedDescription,
    min,
    max,
    step,
    accept,
    multiple,
  };

  const props: FieldComponentProps = { ...baseProps };

  if (type === 'select' || type === 'radio' || type === 'multiSelect') {
    props.options = resolvedOptionsList;
  }

  if (['text', 'email', 'password', 'url', 'tel'].includes(type)) {
    props.type = type as any;
    props.datalist = datalist?.options;
  }

  if (type === 'rating') {
    props.ratingConfig = ratingConfig;
  }
  if (type === 'phone') {
    props.phoneConfig = phoneConfig;
  }
  if (type === 'colorPicker') {
    props.colorConfig = colorConfig;
  }
  if (type === 'multiSelect') {
    props.multiSelectConfig = multiSelectConfig;
  }
  if (type === 'location') {
    props.locationConfig = locationConfig;
  }
  if (type === 'duration') {
    props.durationConfig = durationConfig;
  }
  if (type === 'autocomplete') {
    props.autocompleteConfig =
      autocompleteConfig && resolveOptions
        ? {
            ...autocompleteConfig,
            options: resolveOptions(autocompleteConfig.options, subscribedValues),
          }
        : autocompleteConfig;
  }
  if (type === 'masked') {
    props.maskedInputConfig = maskedInputConfig;
  }
  if (type === 'slider') {
    props.sliderConfig = sliderConfig;
  }
  if (type === 'number') {
    props.numberConfig = numberConfig;
  }
  if (type === 'date') {
    props.dateConfig = dateConfig;
  }
  if (type === 'file') {
    props.fileConfig = fileConfig;
  }
  if (type === 'textarea') {
    props.textareaConfig = textareaConfig;
  }
  if (type === 'password') {
    props.passwordConfig = passwordConfig;
  }
  if (type === 'email') {
    props.emailConfig = emailConfig;
  }

  return <FieldComponent {...props} />;
};
