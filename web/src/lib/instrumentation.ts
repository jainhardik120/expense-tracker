import { trace, SpanStatusCode } from '@opentelemetry/api';

const isPromise = <T>(value: T | Promise<T>): value is Promise<T> => {
  return value instanceof Promise;
};

export const instrumentedFunction = <Args extends unknown[], R>(
  name: string,
  fn: (...args: Args) => R | Promise<R>,
) =>
  function (this: unknown, ...args: Args): Promise<R> {
    const tracer = trace.getTracer('expense-tracker');
    return tracer.startActiveSpan(name, async (span) => {
      try {
        const result = fn.apply(this, args);
        if (isPromise(result)) {
          const resolvedResult = await result;
          span.end();
          return resolvedResult;
        }
        span.end();
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
        throw err;
      }
    });
  };
