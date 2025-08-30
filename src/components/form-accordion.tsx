'use client';
import type React from 'react';

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { FormAccordionProps } from '@/lib/types';
import { cn } from '@/lib/utils';

export const FormAccordion: React.FC<FormAccordionProps> = ({
  children,
  sections,
  type = 'single',
  className,
}) => {
  return (
    <div className={cn('space-y-4', className)}>
      {children}

      {type === 'single' ? (
        <Accordion collapsible defaultValue={sections.find((s) => s.defaultOpen)?.id} type="single">
          {sections.map((section) => (
            <AccordionItem key={section.id} value={section.id}>
              <AccordionTrigger>{section.title}</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">{section.content}</div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <Accordion
          defaultValue={sections.filter((s) => s.defaultOpen).map((s) => s.id)}
          type="multiple"
        >
          {sections.map((section) => (
            <AccordionItem key={section.id} value={section.id}>
              <AccordionTrigger>{section.title}</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">{section.content}</div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
};
