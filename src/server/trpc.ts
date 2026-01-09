import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { treeifyError, ZodError } from 'zod';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import logger from '@/lib/logger';

import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import type { OpenApiMeta } from 'trpc-to-openapi';

const t = initTRPC
  .meta<OpenApiMeta>()
  .context<() => Context>()
  .create({
    transformer: superjson,
    errorFormatter: ({ shape, error }) => ({
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? treeifyError(error.cause) : null,
      },
    }),
  });

const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();
  const result = await next();
  const end = Date.now();
  logger.info(`TRPC ${path} took ${end - start}ms to execute`, {
    path,
    durationMs: end - start,
  });
  return result;
});

export const createTRPCContext = (opts: { headers: Headers }) => {
  return {
    db: db,
    ...opts,
  };
};

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

export const createTRPCContextNext = async ({
  req,
  // eslint-disable-next-line @typescript-eslint/require-await
}: FetchCreateContextFnOptions): Promise<Context> => {
  return {
    db: db,
    headers: req.headers,
  };
};

export const { createCallerFactory } = t;

export const createTRPCRouter = t.router;

export const publicProcedure = t.procedure.use(timingMiddleware).use(async ({ ctx, next }) => {
  return next({
    ctx: {
      ...ctx,
    },
  });
});

export const protectedProcedure = t.procedure.use(timingMiddleware).use(async ({ ctx, next }) => {
  const session = await auth.api.getSession({ headers: ctx.headers });
  if (session === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      session,
    },
  });
});
