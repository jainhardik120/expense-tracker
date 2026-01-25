import { initTRPC, TRPCError } from '@trpc/server';
import { verifyJwsAccessToken } from 'better-auth';
import { eq } from 'drizzle-orm';
import superjson from 'superjson';
import { treeifyError, ZodError } from 'zod';

import { user } from '@/db/auth-schema';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getBaseUrl } from '@/lib/getBaseUrl';
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

const getUser = async (ctx: Context) => {
  const { headers } = ctx;
  const authHeader = headers.get('Authorization');
  if (authHeader !== null) {
    const accessToken = authHeader.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '')
      : authHeader;
    const payload = await verifyJwsAccessToken(accessToken, {
      verifyOptions: {
        issuer: `${getBaseUrl()}/api/auth`,
        audience: `${getBaseUrl()}/api/external`,
      },
      jwksFetch: `${getBaseUrl()}/api/auth/jwks`,
    });
    const userId = payload.sub;
    if (userId === undefined) {
      return;
    }
    const dbUsers = await ctx.db.select().from(user).where(eq(user.id, userId)).limit(1);
    if (dbUsers.length === 0) {
      return;
    }
    return dbUsers[0];
  }
  const session = await auth.api.getSession({ headers });
  if (session === null) {
    return;
  }
  return session.user;
};

export const protectedProcedure = t.procedure.use(timingMiddleware).use(async ({ ctx, next }) => {
  const user = await getUser(ctx);
  if (user === undefined) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      user,
    },
  });
});

export const adminProcedure = t.procedure.use(timingMiddleware).use(async ({ ctx, next }) => {
  const user = await getUser(ctx);
  if (user?.role !== 'admin') {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      user,
    },
  });
});
