import * as React from 'react';

const useLazyRef = <T>(fn: () => T): React.RefObject<T> => {
  const ref = React.useRef<T | null>(null);
  ref.current ??= fn();
  return ref as React.RefObject<T>;
};

export { useLazyRef };
