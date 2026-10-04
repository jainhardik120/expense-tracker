import { type ClipboardEvent, type KeyboardEvent, type ReactNode, useState } from 'react';

import { X } from 'lucide-react';
import {
  type ControllerRenderProps,
  type FieldValues,
  type Path,
  type PathValue,
} from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import DateInput from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { withDatePart } from '@/lib/date-part';

import { Autocomplete } from '../ui/autocomplete';
import { Button } from '../ui/button';

type SelectOption = { label: string; value: string };

export type FormField<T extends FieldValues = FieldValues> = {
  name: Path<T>;
  label: string | ReactNode;
  type: keyof typeof RenderedFormFields;
  placeholder?: string;
  description?: string;
  options?: SelectOption[];
  min?: number;
  max?: number;
  step?: number;
  render?: (field: ControllerRenderProps<T, Path<T>>) => ReactNode;
  displayCondition?: ((values: T) => boolean) | boolean;
  valueWhenHidden?: PathValue<T, Path<T>>;
};

export const isFieldVisible = <T extends FieldValues = FieldValues>(
  field: FormField<T>,
  values: T,
): boolean => {
  const { displayCondition = true } = field;
  return typeof displayCondition === 'function' ? displayCondition(values) : displayCondition;
};

type FieldProps<T extends FieldValues = FieldValues> = {
  field: ControllerRenderProps<T, Path<T>>;
  formField: FormField<T>;
  id: string;
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
          <Badge key={item} className="max-w-[320px] px-2 py-1" variant="secondary">
            <span className="min-w-0 truncate">{item}</span>
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

const RenderedDateInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => {
  const fieldDate = props.field.value;
  return (
    <DateInput
      date={fieldDate}
      onChange={(date) => {
        props.field.onChange(withDatePart(fieldDate, date));
      }}
    />
  );
};

const RenderedDatetimeInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => {
  const fieldDate = props.field.value as Date;
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timeValue = `${pad(fieldDate.getHours())}:${pad(fieldDate.getMinutes())}:${pad(fieldDate.getSeconds())}`;
  return (
    <div className="flex gap-4">
      <DateInput
        date={fieldDate}
        onChange={(date) => {
          props.field.onChange(withDatePart(fieldDate, date));
        }}
      />
      <Input
        className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        step="1"
        type="time"
        value={timeValue}
        onChange={(e) => {
          const [h, m, s] = e.target.value.split(':').map(Number);
          const time = new Date(fieldDate);
          time.setHours(h);
          time.setMinutes(m);
          time.setSeconds(s);
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

const RenderedSelectInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => {
  const [key, setKey] = useState(+new Date());

  return (
    <Select key={key} value={props.field.value} onValueChange={props.field.onChange}>
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
        <SelectSeparator />
        <Button
          className="w-full px-2"
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            props.field.onChange('');
            setKey(+new Date());
          }}
        >
          Clear
        </Button>
      </SelectContent>
    </Select>
  );
};

const RenderedColorInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => (
  <Input type="color" {...props.field} />
);

const RenderedIntegerInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => (
  <Input
    max={props.formField.max}
    min={props.formField.min}
    placeholder={props.formField.placeholder}
    step={props.formField.step ?? 1}
    type="number"
    {...props.field}
    id={props.id}
    value={(props.field.value as number | undefined) ?? ''}
    onChange={(event) => {
      props.field.onChange(event.target.value === '' ? undefined : event.target.valueAsNumber);
    }}
  />
);

const RenderedCheckboxInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => (
  <Checkbox
    checked={props.field.value as boolean}
    id={props.id}
    onCheckedChange={(checked) => {
      props.field.onChange(checked);
    }}
  />
);

const renderTextInput = (type?: 'password' | 'email' | 'tel' | 'url') => {
  const RenderedTextInput = <T extends FieldValues = FieldValues>(props: FieldProps<T>) => (
    <Input placeholder={props.formField.placeholder} type={type} {...props.field} id={props.id} />
  );
  return RenderedTextInput;
};

export const RenderedFormFields: {
  [key: string]: <T extends FieldValues>(props: FieldProps<T>) => ReactNode;
} = {
  input: renderTextInput(),
  autocompleteInput: (props) => (
    <Autocomplete
      options={props.formField.options ?? []}
      {...props.field}
      onValueChange={props.field.onChange}
    />
  ),
  number: (props) => (
    <Input
      max={props.formField.max}
      min={props.formField.min}
      placeholder={props.formField.placeholder}
      step={props.formField.step}
      type="number"
      {...props.field}
      id={props.id}
    />
  ),
  textarea: (props) => (
    <Textarea placeholder={props.formField.placeholder} {...props.field} id={props.id} />
  ),
  password: renderTextInput('password'),
  email: renderTextInput('email'),
  tel: renderTextInput('tel'),
  url: renderTextInput('url'),
  integer: RenderedIntegerInput,
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
  id,
}: {
  type: keyof typeof RenderedFormFields;
  field: ControllerRenderProps<T, Path<T>>;
  formField: FormField<T>;
  id: string;
}) => {
  const RenderedInput = RenderedFormFields[type];
  return <RenderedInput field={field} formField={formField} id={id} />;
};

export const RenderLabelAfter: Partial<keyof typeof RenderedFormFields> = 'checkbox';
