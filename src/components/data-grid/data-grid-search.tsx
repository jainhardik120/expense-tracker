'use client';

import * as React from 'react';

import { ChevronDown, ChevronUp, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAsRef } from '@/hooks/use-as-ref';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import type { SearchState } from '@/types/data-grid';

interface DataGridSearchProps extends SearchState {}

const DataGridSearchImpl = ({
  searchMatches,
  matchIndex,
  searchOpen,
  onSearchOpenChange,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  onNavigateToNextMatch,
  onNavigateToPrevMatch,
}: DataGridSearchProps) => {
  const propsRef = useAsRef({
    onSearchOpenChange,
    onSearchQueryChange,
    onSearch,
    onNavigateToNextMatch,
    onNavigateToPrevMatch,
  });

  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [searchOpen]);

  React.useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        propsRef.current.onSearchOpenChange(false);
      }
    };

    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('keydown', onEscape);
    };
  }, [searchOpen, propsRef]);

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      event.stopPropagation();

      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) {
          propsRef.current.onNavigateToPrevMatch();
        } else {
          propsRef.current.onNavigateToNextMatch();
        }
      }
    },
    [propsRef],
  );

  const debouncedSearch = useDebouncedCallback((query: string) => {
    propsRef.current.onSearch(query);
  }, 150);

  const onChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      propsRef.current.onSearchQueryChange(value);
      debouncedSearch(value);
    },
    [propsRef, debouncedSearch],
  );

  const onTriggerPointerDown = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    // prevent implicit pointer capture
    const { target } = event;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    // Only prevent default if we're not clicking on the input
    // This allows text selection in the input while still preventing focus stealing elsewhere
    if (
      event.button === 0 &&
      event.ctrlKey === false &&
      event.pointerType === 'mouse' &&
      !(event.target instanceof HTMLInputElement)
    ) {
      event.preventDefault();
    }
  }, []);

  const onPrevMatchPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      onTriggerPointerDown(event);
    },
    [onTriggerPointerDown],
  );

  const onNextMatchPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      onTriggerPointerDown(event);
    },
    [onTriggerPointerDown],
  );

  const onClose = React.useCallback(() => {
    propsRef.current.onSearchOpenChange(false);
  }, [propsRef]);

  const onPrevMatch = React.useCallback(() => {
    propsRef.current.onNavigateToPrevMatch();
  }, [propsRef]);

  const onNextMatch = React.useCallback(() => {
    propsRef.current.onNavigateToNextMatch();
  }, [propsRef]);

  if (!searchOpen) {
    return null;
  }

  return (
    <div
      className="fade-in-0 slide-in-from-top-2 animate-in bg-background absolute end-4 top-4 z-50 flex flex-col gap-2 rounded-lg border p-2 shadow-lg"
      data-slot="grid-search"
      role="search"
    >
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="h-8 w-64"
          placeholder="Find in table..."
          spellCheck={false}
          value={searchQuery}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous match"
            className="size-7"
            disabled={searchMatches.length === 0}
            size="icon"
            variant="ghost"
            onClick={onPrevMatch}
            onPointerDown={onPrevMatchPointerDown}
          >
            <ChevronUp />
          </Button>
          <Button
            aria-label="Next match"
            className="size-7"
            disabled={searchMatches.length === 0}
            size="icon"
            variant="ghost"
            onClick={onNextMatch}
            onPointerDown={onNextMatchPointerDown}
          >
            <ChevronDown />
          </Button>
          <Button
            aria-label="Close search"
            className="size-7"
            size="icon"
            variant="ghost"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      <div className="text-muted-foreground flex items-center gap-1 text-xs whitespace-nowrap">
        {searchMatches.length > 0 ? (
          <span>
            {matchIndex + 1} of {searchMatches.length}
          </span>
        ) : searchQuery ? (
          <span>No results</span>
        ) : (
          <span>Type to search</span>
        )}
      </div>
    </div>
  );
};

export const DataGridSearch = React.memo(DataGridSearchImpl, (prev, next) => {
  if (prev.searchOpen !== next.searchOpen) {
    return false;
  }

  if (!next.searchOpen) {
    return true;
  }

  if (prev.searchQuery !== next.searchQuery || prev.matchIndex !== next.matchIndex) {
    return false;
  }

  if (prev.searchMatches.length !== next.searchMatches.length) {
    return false;
  }

  for (let i = 0; i < prev.searchMatches.length; i++) {
    const prevMatch = prev.searchMatches[i];
    const nextMatch = next.searchMatches[i];

    if (!prevMatch || !nextMatch) {
      return false;
    }

    if (prevMatch.rowIndex !== nextMatch.rowIndex || prevMatch.columnId !== nextMatch.columnId) {
      return false;
    }
  }

  return true;
});
