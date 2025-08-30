import type React from 'react';

import { Slider } from '@/components/ui/slider';
import type { SliderFieldSpecificProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { FieldWrapper } from './base-field-wrapper';

export const SliderField: React.FC<SliderFieldSpecificProps> = ({
  fieldApi,
  label,
  description,
  inputClassName,
  labelClassName,
  wrapperClassName,
  sliderConfig,
  // Backwards compatibility props
  min: directMin = 0,
  max: directMax = 100,
  step: directStep = 1,
  valueLabelPrefix: directPrefix = '',
  valueLabelSuffix: directSuffix = '',
  valueDisplayPrecision: directPrecision = 0,
  showRawValue: directShowRaw = false,
}) => {
  const { name } = fieldApi;
  const isDisabled = fieldApi.form?.state?.isSubmitting ?? false;

  // Use sliderConfig if provided, otherwise use direct props
  const config = sliderConfig || {
    min: directMin,
    max: directMax,
    step: directStep,
    valueLabelPrefix: directPrefix,
    valueLabelSuffix: directSuffix,
    valueDisplayPrecision: directPrecision,
    showRawValue: directShowRaw,
  };

  const {
    min = 0,
    max = 100,
    step = 1,
    valueMapping,
    gradientColors,
    visualizationComponent: VisualizationComponent,
    valueLabelPrefix = '',
    valueLabelSuffix = '',
    valueDisplayPrecision = 0,
    showRawValue = false,
    showValue = true,
    marks = [],
  } = config;

  const fieldValue = typeof fieldApi.state?.value === 'number' ? fieldApi.state?.value : min;

  // Get display value from mapping or calculate it
  const getDisplayValue = (sliderValue: number) => {
    if (valueMapping) {
      const mapping = valueMapping.find((m) => m.sliderValue === sliderValue);
      return mapping ? mapping.displayValue : sliderValue;
    }
    return sliderValue.toFixed(valueDisplayPrecision);
  };

  const displayValue = getDisplayValue(fieldValue);
  const mappingItem = valueMapping?.find((m) => m.sliderValue === fieldValue);

  const onValueChange = (valueArray: number[]) => {
    const newValue = valueArray[0];
    fieldApi.handleChange(newValue);
  };

  const onBlur = () => {
    fieldApi.handleBlur();
  };

  // Custom label with value display
  const customLabel =
    label && showValue ? `${label} (${valueLabelPrefix}${displayValue}${valueLabelSuffix})` : label;

  // Generate unique ID for this slider instance
  const sliderId = `slider-${name}-${Math.random().toString(36).substring(2, 9)}`;

  // Calculate current color based on slider value
  const getCurrentColor = () => {
    if (!gradientColors) {
      return null;
    }

    const percentage = ((fieldValue - min) / (max - min)) * 100;

    // Parse hex colors
    const startColor = gradientColors.start;
    const endColor = gradientColors.end;

    // Convert hex to RGB
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : null;
    };

    const startRgb = hexToRgb(startColor);
    const endRgb = hexToRgb(endColor);

    if (!startRgb || !endRgb) {
      return startColor;
    }

    // Interpolate between start and end colors
    const r = Math.round(startRgb.r + (endRgb.r - startRgb.r) * (percentage / 100));
    const g = Math.round(startRgb.g + (endRgb.g - startRgb.g) * (percentage / 100));
    const b = Math.round(startRgb.b + (endRgb.b - startRgb.b) * (percentage / 100));

    return `rgb(${r}, ${g}, ${b})`;
  };

  const currentColor = getCurrentColor();

  return (
    <FieldWrapper
      description={description}
      fieldApi={fieldApi}
      inputClassName={inputClassName}
      label={customLabel}
      labelClassName={labelClassName}
      wrapperClassName={wrapperClassName}
    >
      <div className="space-y-4">
        {showRawValue ? (
          <div className="text-muted-foreground text-xs">Raw: {fieldApi.state?.value}</div>
        ) : null}

        {/* Custom visualization component if provided */}
        {VisualizationComponent && valueMapping ? (
          <div className="mb-2 flex items-center justify-between">
            {valueMapping.map((mapping, index) => (
              <div
                key={index}
                className="cursor-pointer"
                onClick={() => {
                  fieldApi.handleChange(mapping.sliderValue);
                }}
              >
                <VisualizationComponent
                  displayValue={mapping.displayValue}
                  isActive={fieldValue === mapping.sliderValue}
                  label={mapping.label}
                  value={mapping.sliderValue}
                />
              </div>
            ))}
          </div>
        ) : null}

        <div className="relative">
          {gradientColors && currentColor ? (
            <style>{`
              .${sliderId} [data-slot="slider-range"] {
                background: ${currentColor} !important;
              }
            `}</style>
          ) : null}
          <Slider
            className={cn(inputClassName, gradientColors && sliderId)}
            disabled={isDisabled}
            id={name}
            max={max}
            min={min}
            name={name}
            step={step}
            value={[fieldValue]}
            onBlur={onBlur}
            onValueChange={onValueChange}
          />

          {/* Marks display */}
          {marks.length > 0 && (
            <div className="text-muted-foreground mt-2 flex justify-between text-xs">
              {marks.map((mark, index) => (
                <span key={index} className="text-center">
                  {mark.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Display current mapping info */}
        {mappingItem?.label ? (
          <div className="text-muted-foreground text-center text-sm">{mappingItem.label}</div>
        ) : null}
      </div>
    </FieldWrapper>
  );
};
