'use client';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';

import { Plus, Trash2, GripVertical } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ArrayFieldProps } from '@/lib/types';

import { FieldWrapper } from './base-field-wrapper';
import { NestedFieldRenderer } from './shared-field-renderer';

export const ArrayField: React.FC<ArrayFieldProps> = ({
  fieldApi,
  label,
  description,
  inputClassName,
  labelClassName,
  wrapperClassName,
  arrayConfig,
}) => {
  const { name } = fieldApi;
  const isDisabled = fieldApi.form?.state?.isSubmitting ?? false;

  const value = useMemo(() => (fieldApi.state?.value as unknown[]) || [], [fieldApi.state?.value]);

  const {
    itemType,
    itemLabel,
    itemPlaceholder,
    minItems = 0,
    maxItems = 10,
    addButtonLabel = 'Add Item',
    removeButtonLabel = 'Remove',
    itemComponent: CustomItemComponent,
    sortable = false,
    defaultValue = '',
    itemProps = {},
    objectConfig,
  } = arrayConfig || {};

  // Create field config for each item
  const createItemFieldConfig = useCallback(
    (index: number) => {
      const baseConfig: any = {
        name: `${name}[${index}]`,
        type: itemType || 'text',
        label: itemLabel ? `${itemLabel} ${index + 1}` : undefined,
        placeholder: itemPlaceholder,
        component: CustomItemComponent,
        ...itemProps,
      };

      // Add object config if item type is object
      if (itemType === 'object' && objectConfig) {
        baseConfig.objectConfig = objectConfig;
      }

      return baseConfig;
    },
    [name, itemType, itemLabel, itemPlaceholder, CustomItemComponent, itemProps, objectConfig],
  );

  const addItem = useCallback(() => {
    if (value.length >= maxItems) {
      return;
    }

    const newValue = [...value, defaultValue];
    fieldApi.handleChange(newValue);
  }, [value, maxItems, defaultValue, fieldApi]);

  const removeItem = useCallback(
    (index: number) => {
      if (value.length <= minItems) {
        return;
      }

      const newValue = value.filter((_, i) => i !== index);
      fieldApi.handleChange(newValue);
      fieldApi.handleBlur();
    },
    [value, minItems, fieldApi],
  );

  const updateItem = useCallback(
    (index: number, newItemValue: unknown) => {
      const newValue = [...value];
      newValue[index] = newItemValue;
      fieldApi.handleChange(newValue);
    },
    [value, fieldApi],
  );

  const moveItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!sortable) {
        return;
      }
      if (fromIndex === toIndex) {
        return;
      }

      const newValue = [...value];
      const [movedItem] = newValue.splice(fromIndex, 1);
      newValue.splice(toIndex, 0, movedItem);
      fieldApi.handleChange(newValue);
    },
    [value, fieldApi, sortable],
  );

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Create a mock field API for each item
  const createItemFieldApi = useCallback(
    (index: number) => {
      return {
        name: `${name}[${index}]`,
        state: {
          value: value[index],
          meta: {
            errors: [],
            isTouched: false,
            isValidating: false,
          },
        },
        handleChange: (newValue: unknown) => {
          updateItem(index, newValue);
        },
        handleBlur: () => {
          fieldApi.handleBlur();
        },
        form: fieldApi.form,
      };
    },
    [name, value, updateItem, fieldApi],
  );

  const canAddMore = value.length < maxItems;
  const canRemove = value.length > minItems;

  return (
    <FieldWrapper
      description={description}
      fieldApi={fieldApi}
      inputClassName={inputClassName}
      label={label}
      labelClassName={labelClassName}
      wrapperClassName={wrapperClassName}
    >
      <div className="space-y-4">
        <div className="space-y-3">
          {value.map((_, index) => (
            <div
              key={index}
              className="bg-card flex items-start gap-2 rounded-lg border p-3"
              onDragOver={
                sortable
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  : undefined
              }
              onDrop={
                sortable
                  ? (e) => {
                      e.preventDefault();
                      if (draggedIndex !== null && draggedIndex !== index) {
                        moveItem(draggedIndex, index);
                      }
                    }
                  : undefined
              }
            >
              {sortable ? (
                <button
                  className="hover:bg-muted mt-2 cursor-grab rounded p-1 active:cursor-grabbing"
                  disabled={isDisabled}
                  draggable
                  type="button"
                  onDragEnd={() => {
                    setDraggedIndex(null);
                  }}
                  onDragStart={(e) => {
                    setDraggedIndex(index);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <GripVertical className="text-muted-foreground h-4 w-4" />
                </button>
              ) : null}

              <div className="flex-1">
                <NestedFieldRenderer
                  currentValues={(value[index] || {}) as Record<string, unknown>}
                  fieldApi={createItemFieldApi(index) as any}
                  fieldConfig={createItemFieldConfig(index)}
                  form={fieldApi.form}
                />
              </div>

              {canRemove ? (
                <Button
                  className="text-destructive hover:text-destructive mt-2 h-8 w-8 p-0"
                  disabled={isDisabled}
                  size="sm"
                  title={removeButtonLabel}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    removeItem(index);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}

          {value.length === 0 && (
            <div className="text-muted-foreground rounded-lg border-2 border-dashed py-8 text-center">
              <p className="text-sm">No items added yet</p>
              <p className="mt-1 text-xs">
                Click &quot;{addButtonLabel}&quot; to add your first item
              </p>
            </div>
          )}
        </div>

        {canAddMore ? (
          <Button
            className="w-full"
            disabled={isDisabled}
            type="button"
            variant="outline"
            onClick={addItem}
          >
            <Plus className="mr-2 h-4 w-4" />
            {addButtonLabel}
          </Button>
        ) : null}

        {minItems > 0 && value.length < minItems && (
          <p className="text-muted-foreground text-xs">
            Minimum {minItems} item{minItems !== 1 ? 's' : ''} required
          </p>
        )}
      </div>
    </FieldWrapper>
  );
};
