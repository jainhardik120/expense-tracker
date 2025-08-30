'use client';
import type React from 'react';
import { useState } from 'react';

import { Star, Heart, ThumbsUp } from 'lucide-react';

import type { RatingFieldSpecificProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { FieldWrapper } from './base-field-wrapper';

const ICON_COMPONENTS = {
  star: Star,
  heart: Heart,
  thumbs: ThumbsUp,
};

const SIZE_CLASSES = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export const RatingField: React.FC<RatingFieldSpecificProps> = ({
  fieldApi,
  label,
  description,
  inputClassName,
  labelClassName,
  wrapperClassName,
  ratingConfig = {},
}) => {
  const {
    max = 5,
    allowHalf = false,
    icon = 'star',
    size = 'md',
    showValue = false,
  } = ratingConfig;

  const value = (fieldApi.state?.value as number) || 0;
  const isDisabled = fieldApi.form?.state?.isSubmitting ?? false;

  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const IconComponent = ICON_COMPONENTS[icon];
  const iconSizeClass = SIZE_CLASSES[size];

  const handleRatingClick = (rating: number) => {
    fieldApi.handleChange(rating);
    fieldApi.handleBlur();
  };

  const handleMouseEnter = (rating: number) => {
    if (!fieldApi.form.state.isSubmitting) {
      setHoverValue(rating);
    }
  };

  const handleMouseLeave = () => {
    setHoverValue(null);
  };

  const getRatingValue = (index: number, isHalf: boolean = false): number => {
    return isHalf ? index + 0.5 : index + 1;
  };

  const shouldShowFilled = (index: number, isHalf: boolean = false): boolean => {
    const ratingValue = getRatingValue(index, isHalf);
    const currentValue = hoverValue !== null ? hoverValue : value;

    if (isHalf) {
      return currentValue >= ratingValue;
    }
    return currentValue >= ratingValue || (allowHalf && currentValue >= ratingValue - 0.5);
  };

  const shouldShowHalfFilled = (index: number): boolean => {
    if (!allowHalf) {
      return false;
    }

    const currentValue = hoverValue !== null ? hoverValue : value;
    const fullRating = index + 1;
    const halfRating = index + 0.5;

    return currentValue >= halfRating && currentValue < fullRating;
  };

  return (
    <FieldWrapper
      description={description}
      fieldApi={fieldApi}
      inputClassName={inputClassName}
      label={label}
      labelClassName={labelClassName}
      wrapperClassName={wrapperClassName}
    >
      <div className="space-y-2">
        {showValue ? (
          <div className="text-muted-foreground text-xs">
            ({value}/{max})
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          {Array.from({ length: max }, (_, index) => (
            <div key={index} className="relative">
              {/* Full star/icon button */}
              <button
                className={cn(
                  'relative transition-all duration-150 hover:scale-110',
                  isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                )}
                disabled={isDisabled}
                title={`Rate ${getRatingValue(index, false)} ${icon}${
                  getRatingValue(index, false) !== 1 ? 's' : ''
                }`}
                type="button"
                onBlur={() => {
                  fieldApi.handleBlur();
                }}
                onClick={() => !isDisabled && handleRatingClick(getRatingValue(index, false))}
                onMouseEnter={() => !isDisabled && handleMouseEnter(getRatingValue(index, false))}
                onMouseLeave={handleMouseLeave}
              >
                <IconComponent
                  className={cn(
                    iconSizeClass,
                    'transition-colors duration-150',
                    shouldShowFilled(index, false)
                      ? icon === 'star'
                        ? 'fill-yellow-400 text-yellow-400'
                        : icon === 'heart'
                          ? 'fill-red-500 text-red-500'
                          : 'fill-blue-500 text-blue-500'
                      : 'text-muted-foreground hover:text-muted-foreground/80',
                  )}
                />

                {/* Half-fill overlay for half ratings */}
                {allowHalf && shouldShowHalfFilled(index) ? (
                  <div className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
                    <IconComponent
                      className={cn(
                        iconSizeClass,
                        icon === 'star'
                          ? 'fill-yellow-400 text-yellow-400'
                          : icon === 'heart'
                            ? 'fill-red-500 text-red-500'
                            : 'fill-blue-500 text-blue-500',
                      )}
                    />
                  </div>
                ) : null}
              </button>

              {/* Half star/icon button (if half ratings allowed) */}
              {allowHalf ? (
                <button
                  className={cn(
                    'absolute inset-0 w-1/2 transition-all duration-150',
                    isDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
                  )}
                  disabled={isDisabled}
                  title={`Rate ${getRatingValue(index, true)} ${icon}s`}
                  type="button"
                  onClick={() => !isDisabled && handleRatingClick(getRatingValue(index, true))}
                  onMouseEnter={() => !isDisabled && handleMouseEnter(getRatingValue(index, true))}
                  onMouseLeave={handleMouseLeave}
                />
              ) : null}
            </div>
          ))}

          {/* Clear rating button */}
          {value > 0 && (
            <button
              className={cn(
                'text-muted-foreground hover:text-foreground ml-2 text-xs transition-colors',
                isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              )}
              disabled={isDisabled}
              title="Clear rating"
              type="button"
              onClick={() => !isDisabled && handleRatingClick(0)}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </FieldWrapper>
  );
};
