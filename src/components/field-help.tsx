'use client';
import type React from 'react';
import { useState } from 'react';

import { HelpCircle, ExternalLink, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FieldHelpProps {
  help?: {
    text?: string;
    tooltip?: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    link?: { url: string; text: string };
  };
  className?: string;
}

export const FieldHelp: React.FC<FieldHelpProps> = ({ help, className }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!help || (!help.text && !help.tooltip && !help.link)) {
    return null;
  }

  const { text, tooltip, position = 'top', link } = help;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Help text */}
      {text ? (
        <div className="text-muted-foreground flex items-start gap-2 text-xs">
          <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <p>{text}</p>
        </div>
      ) : null}

      {/* Tooltip trigger */}
      {tooltip ? (
        <div className="relative inline-block">
          <Button
            className="text-muted-foreground hover:text-foreground h-6 w-6 p-0"
            size="sm"
            type="button"
            variant="ghost"
            onBlur={() => {
              setShowTooltip(false);
            }}
            onFocus={() => {
              setShowTooltip(true);
            }}
            onMouseEnter={() => {
              setShowTooltip(true);
            }}
            onMouseLeave={() => {
              setShowTooltip(false);
            }}
          >
            <HelpCircle className="h-3 w-3" />
          </Button>

          {/* Tooltip */}
          {showTooltip ? (
            <div
              className={cn(
                'absolute z-50 rounded bg-black px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg',
                'pointer-events-none',
                {
                  'bottom-full left-1/2 mb-1 -translate-x-1/2': position === 'top',
                  'top-full left-1/2 mt-1 -translate-x-1/2': position === 'bottom',
                  'top-1/2 right-full mr-1 -translate-y-1/2': position === 'left',
                  'top-1/2 left-full ml-1 -translate-y-1/2': position === 'right',
                },
              )}
            >
              {tooltip}
              {/* Tooltip arrow */}
              <div
                className={cn('absolute h-0 w-0 border-2 border-transparent', {
                  'top-full left-1/2 -translate-x-1/2 border-b-0 border-t-black':
                    position === 'top',
                  'bottom-full left-1/2 -translate-x-1/2 border-t-0 border-b-black':
                    position === 'bottom',
                  'top-1/2 left-full -translate-y-1/2 border-r-0 border-l-black':
                    position === 'left',
                  'top-1/2 right-full -translate-y-1/2 border-l-0 border-r-black':
                    position === 'right',
                })}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Help link */}
      {link ? (
        <div className="flex items-center gap-1">
          <Button
            className="text-primary hover:text-primary/80 h-auto p-0 text-xs"
            size="sm"
            type="button"
            variant="link"
            onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
          >
            {link.text}
            <ExternalLink className="ml-1 h-3 w-3" />
          </Button>
        </div>
      ) : null}
    </div>
  );
};
