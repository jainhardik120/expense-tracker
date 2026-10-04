import * as React from 'react';

const subscribe = () => () => undefined;

const useIsHydrated = (): boolean =>
  React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

export { useIsHydrated };
