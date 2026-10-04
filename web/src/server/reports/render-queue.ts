let tail: Promise<unknown> = Promise.resolve();

export const renderOneAtATime = <T>(render: () => Promise<T>): Promise<T> => {
  const turn = tail.then(render, render);
  tail = turn.catch(() => undefined);
  return turn;
};
