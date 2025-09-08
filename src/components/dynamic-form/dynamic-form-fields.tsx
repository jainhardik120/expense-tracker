import { type ClipboardEvent, type KeyboardEvent, type ReactNode, useState } from 'react';

import { X } from 'lucide-react';
import { type ControllerRenderProps, type Path, type FieldValues } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import DateInput from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type SelectOption = { label: string; value: string };

export type FormField<T extends FieldValues = FieldValues> = {
  name: Path<T>;
  label: string;
  type: keyof typeof RenderedFormFields;
  placeholder?: string;
  description?: string;
  options?: SelectOption[];
  min?: number;
  max?: number;
  step?: number;
  render?: (field: ControllerRenderProps<T, Path<T>>) => ReactNode;
};

type FieldProps<T extends FieldValues = FieldValues> = {
  field: ControllerRenderProps<T, Path<T>>;
  formField: FormField<T>;
};

const RenderedStringArrayInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => {
  const [value, setValue] = useState<string>('');

  if (!Array.isArray(props.field.value)) {
    props.field.onChange([]);
  }
  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();

      if (value.trim().length > 0) {
        const newValue = [...props.field.value, value.trim()];
        props.field.onChange(newValue);
        setValue('');
      }
    }
  };

  const handleBlur = () => {
    if (value.trim().length > 0) {
      const newValue = [...props.field.value, value.trim()];
      props.field.onChange(newValue);
      setValue('');
    }
    props.field.onBlur();
  };

  const handleRemoveItem = (index: number) => {
    const newValue = [...props.field.value];
    newValue.splice(index, 1);
    props.field.onChange(newValue);
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    const values = pasteData
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (values.length > 0) {
      const newValue = [...props.field.value, ...values];
      props.field.onChange(newValue);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(props.field.value as string[]).map((item: string, index: number) => (
          <Badge key={item} className="px-2 py-1" variant="secondary">
            {item}
            <button
              className="text-muted-foreground hover:text-foreground ml-2"
              title="Remove"
              type="button"
              onClick={() => {
                handleRemoveItem(index);
              }}
            >
              <X size={14} />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        placeholder="Type and press Enter or comma to add"
        value={value}
        onBlur={handleBlur}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onKeyDown={handleInputKeyDown}
        onPaste={handlePaste}
      />
    </>
  );
};

const RenderedTimeInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => (
  <Input placeholder={props.formField.placeholder} type="time" {...props.field} />
);

const RenderedDateInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => (
  <Input placeholder={props.formField.placeholder} type="date" {...props.field} />
);

const RenderedDatetimeInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => {
  const fieldDate = props.field.value as Date;
  return (
    <div className="flex gap-4">
      <DateInput date={fieldDate} onChange={props.field.onChange} />
      <Input
        className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        step="1"
        type="time"
        value={fieldDate.toLocaleTimeString()}
        onChange={(e) => {
          const time = new Date(fieldDate);
          time.setHours(Number(e.target.value.split(':')[0]));
          time.setMinutes(Number(e.target.value.split(':')[1]));
          time.setSeconds(Number(e.target.value.split(':')[2]));
          props.field.onChange(time);
        }}
      />
    </div>
  );
};

const RenderedCustomInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => {
  return (
    <>
      {props.formField.render === undefined ? (
        <div>formField.render is undefined</div>
      ) : (
        props.formField.render(props.field)
      )}
    </>
  );
};

const RenderedRadioInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => (
  <div className="flex flex-col gap-2">
    {props.formField.options?.map((option) => (
      <label key={option.value} className="flex items-center gap-2">
        <Input
          checked={props.field.value === option.value}
          type="radio"
          value={option.value}
          onChange={(e) => {
            props.field.onChange(e.target.value);
          }}
        />
        {option.label}
      </label>
    ))}
  </div>
);

const RenderedSelectInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => (
  <Select value={props.field.value} onValueChange={props.field.onChange}>
    <SelectTrigger className="w-full">
      <SelectValue placeholder={props.formField.placeholder} />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectLabel>{props.formField.label}</SelectLabel>
        {props.formField.options?.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);

const RenderedColorInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => (
  <Input type="color" {...props.field} />
);

const RenderedCheckboxInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => (
  <Input
    checked={props.field.value as boolean}
    type="checkbox"
    onChange={(e) => {
      props.field.onChange(e.target.checked);
    }}
  />
);

export const RenderedFormFields: {
  [key: string]: <T extends FieldValues>(props: FieldProps<T>) => ReactNode;
} = {
  input: (props) => <Input placeholder={props.formField.placeholder} {...props.field} />,
  number: (props) => (
    <Input
      max={props.formField.max}
      min={props.formField.min}
      placeholder={props.formField.placeholder}
      step={props.formField.step}
      type="number"
      {...props.field}
    />
  ),
  textarea: (props) => <Textarea placeholder={props.formField.placeholder} {...props.field} />,
  password: (props) => (
    <Input placeholder={props.formField.placeholder} type="password" {...props.field} />
  ),
  email: (props) => (
    <Input placeholder={props.formField.placeholder} type="email" {...props.field} />
  ),
  tel: (props) => <Input placeholder={props.formField.placeholder} type="tel" {...props.field} />,
  url: (props) => <Input placeholder={props.formField.placeholder} type="url" {...props.field} />,
  date: RenderedDateInput,
  time: RenderedTimeInput,
  datetime: RenderedDatetimeInput,
  checkbox: RenderedCheckboxInput,
  color: RenderedColorInput,
  select: RenderedSelectInput,
  radio: RenderedRadioInput,
  custom: RenderedCustomInput,
  stringArray: RenderedStringArrayInput,
};

export const RenderFormInput = <T extends FieldValues = FieldValues>({
  type,
  field,
  formField,
}: {
  type: keyof typeof RenderedFormFields;
  field: ControllerRenderProps<T, Path<T>>;
  formField: FormField<T>;
}) => {
  const RenderedInput = RenderedFormFields[type];
  return (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>
      <RenderedInput field={field} formField={formField} />
    </>
  );
};
