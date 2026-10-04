import { trace, SpanStatusCode } from '@opentelemetry/api';

export const instrumentedFunction = <Args extends unknown[], R>(
  name: string,
  fn: (...args: Args) => R | Promise<R>,
) =>
  function (this: unknown, ...args: Args): Promise<R> {
    const tracer = trace.getTracer('expense-tracker');
    return tracer.startActiveSpan(name, async (span) => {
      try {
        return await fn.apply(this, args);
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    });
  };
