/* eslint-disable react-prefer-function-component/react-prefer-function-component */
'use client';

import { Component, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
  fallbackClassName?: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  // eslint-disable-next-line sonarjs/function-return-type
  render() {
    if (this.state.error !== null) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback(this.state.error);
      }

      return (
        <div
          className={cn(
            'border-destructive/50 bg-destructive/10 flex h-full min-h-[400px] items-center justify-center rounded-xl border shadow-sm',
            this.props.fallbackClassName,
          )}
        >
          <div className="text-center">
            <p className="text-destructive text-sm font-medium">
              {this.state.error.name} : {this.state.error.message}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
