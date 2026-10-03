/**
 * PDF renders in this process, one at a time.
 *
 * A render is CPU-bound on the one thread a Node process has, so running two
 * together finishes neither sooner -- they only take turns. Worse, the template
 * sandbox measures its code's CPU as wall time less time spent in host calls,
 * and turns spent waiting on another render count against it: five year-long
 * reports at once cut each other off at the 5 s budget though none used it. In
 * a queue each render gets the thread to itself, throughput is unchanged, and
 * only one large document is held in memory at a time.
 */
let tail: Promise<unknown> = Promise.resolve();

export const renderOneAtATime = <T,>(render: () => Promise<T>): Promise<T> => {
  const turn = tail.then(render, render);
  // The next render waits for this one whatever its outcome.
  tail = turn.catch(() => undefined);
  return turn;
};
