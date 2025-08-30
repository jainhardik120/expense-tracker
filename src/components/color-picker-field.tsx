'use client';
import type React from 'react';
import { useState, useRef, useEffect } from 'react';

import { Palette, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ColorPickerFieldSpecificProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { FieldWrapper } from './base-field-wrapper';

const DEFAULT_PRESETS = [
  '#FF0000',
  '#FF8000',
  '#FFFF00',
  '#80FF00',
  '#00FF00',
  '#00FF80',
  '#00FFFF',
  '#0080FF',
  '#0000FF',
  '#8000FF',
  '#FF00FF',
  '#FF0080',
  '#000000',
  '#404040',
  '#808080',
  '#C0C0C0',
  '#FFFFFF',
  '#8B4513',
];

// Color conversion utilities
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

const hexToHsl = (hex: string): { h: number; s: number; l: number } | null => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return null;
  }

  const { r, g, b } = rgb;
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const diff = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / diff + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / diff + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / diff + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

const formatColor = (hex: string, format: 'hex' | 'rgb' | 'hsl'): string => {
  switch (format) {
    case 'rgb': {
      const rgb = hexToRgb(hex);
      return rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : hex;
    }
    case 'hsl': {
      const hsl = hexToHsl(hex);
      return hsl ? `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` : hex;
    }
    default:
      return hex;
  }
};

export const ColorPickerField: React.FC<ColorPickerFieldSpecificProps> = ({
  fieldApi,
  colorConfig = {},
  inputClassName,
  ...wrapperProps
}) => {
  const {
    format = 'hex',
    showPreview = true,
    presetColors = DEFAULT_PRESETS,
    allowCustom = true,
  } = colorConfig;

  const value = (fieldApi.state?.value as string) || '#000000';

  const [isOpen, setIsOpen] = useState(false);
  const [customInput, setCustomInput] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Ensure value is always a valid hex color
  const normalizedValue = value.startsWith('#') ? value : `#${value}`;
  const displayValue = formatColor(normalizedValue, format);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleColorSelect = (color: string) => {
    const formattedColor = formatColor(color, format);
    fieldApi.handleChange(formattedColor);
    setCustomInput(color);
    setIsOpen(false);
    fieldApi.handleBlur();
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setCustomInput(inputValue);

    // Validate and update if it's a valid color
    if (inputValue.match(/^#[0-9A-Fa-f]{6}$/)) {
      const formattedColor = formatColor(inputValue, format);
      fieldApi.handleChange(formattedColor);
    }
  };

  const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    const formattedColor = formatColor(color, format);
    fieldApi.handleChange(formattedColor);
    setCustomInput(color);
  };

  const isValidColor = (color: string): boolean => {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  };

  const isDisabled = fieldApi.form.state.isSubmitting;

  return (
    <FieldWrapper fieldApi={fieldApi} {...wrapperProps}>
      <div ref={containerRef} className="relative space-y-2">
        <div className="flex gap-2">
          {/* Color preview and trigger */}
          <div className="relative">
            <Button
              className={cn(
                'h-10 w-12 border-2 p-0',
                fieldApi.state?.meta?.errors.length ? 'border-destructive' : '',
                inputClassName,
              )}
              disabled={isDisabled}
              style={{ backgroundColor: normalizedValue }}
              type="button"
              variant="outline"
              onClick={() => {
                setIsOpen(!isOpen);
              }}
            >
              {!showPreview && <Palette className="h-4 w-4" />}
            </Button>

            {/* Native color input (hidden) */}
            <input
              ref={colorInputRef}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              disabled={isDisabled}
              type="color"
              value={normalizedValue}
              onBlur={() => {
                fieldApi.handleBlur();
              }}
              onChange={handleNativeColorChange}
            />
          </div>

          {/* Color value input */}
          <Input
            className={cn(
              'flex-1',
              fieldApi.state?.meta?.errors.length ? 'border-destructive' : '',
            )}
            disabled={isDisabled}
            placeholder="#000000"
            value={displayValue}
            onBlur={() => {
              fieldApi.handleBlur();
            }}
            onChange={(e) => {
              const inputValue = e.target.value;
              fieldApi.handleChange(inputValue);
              // Try to extract hex value for internal use
              if (inputValue.startsWith('#')) {
                setCustomInput(inputValue);
              }
            }}
          />
        </div>

        {/* Color picker dropdown */}
        {isOpen ? (
          <div className="bg-popover absolute z-50 mt-1 w-64 rounded-md border p-4 shadow-lg">
            {/* Preset colors */}
            <div className="mb-4">
              <h4 className="mb-2 text-sm font-medium">Preset Colors</h4>
              <div className="grid grid-cols-6 gap-2">
                {presetColors.map((color, index) => (
                  <button
                    key={index}
                    className={cn(
                      'h-8 w-8 rounded border-2 transition-transform hover:scale-110',
                      normalizedValue.toLowerCase() === color.toLowerCase()
                        ? 'border-primary ring-primary ring-2 ring-offset-2'
                        : 'border-muted hover:border-primary',
                    )}
                    style={{ backgroundColor: color }}
                    title={color}
                    type="button"
                    onClick={() => {
                      handleColorSelect(color);
                    }}
                  >
                    {normalizedValue.toLowerCase() === color.toLowerCase() && (
                      <Check className="h-4 w-4 text-white drop-shadow-lg" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom color input */}
            {allowCustom ? (
              <div>
                <h4 className="mb-2 text-sm font-medium">Custom Color</h4>
                <div className="flex gap-2">
                  <Input
                    className="flex-1 text-xs"
                    placeholder="#000000"
                    value={customInput}
                    onChange={handleCustomInputChange}
                  />
                  <Button
                    disabled={!isValidColor(customInput)}
                    size="sm"
                    type="button"
                    onClick={() => {
                      handleColorSelect(customInput);
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </FieldWrapper>
  );
};
