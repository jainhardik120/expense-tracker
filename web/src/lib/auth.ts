import { oauthProvider } from '@better-auth/oauth-provider';
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, apiKey, twoFactor, jwt } from 'better-auth/plugins';

import * as schema from '@/db/auth-schema';
import ResetPasswordEmail from '@/emails/reset-password';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { redis } from '@/lib/redis';
import { sendSESEmail } from '@/lib/send-email';

export const auth = betterAuth({
  rateLimit: {
    window: 20,
    max: 100,
    enabled: true,
    storage: 'secondary-storage',
  },
  appName: 'Expense Tracker',
  plugins: [
    jwt(),
    passkey({
      rpID: env.NODE_ENV === 'development' ? 'localhost' : undefined,
    }),
    twoFactor({
      otpOptions: {
        sendOTP: async ({ user, otp }) => {
          await sendSESEmail(
            [user.email],
            'Enter OTP',
            ResetPasswordEmail({ userFirstname: user.name, resetPasswordLink: otp }),
          );
        },
      },
    }),
    apiKey(),
    admin(),
    oauthProvider({
      loginPage: '/auth/login',
      consentPage: '/auth/consent',
    }),
  ],
  secondaryStorage: {
    get: async (key) => {
      return redis.get(key);
    },
    set: async (key, value, ttl) => {
      if (ttl !== undefined) {
        await redis.setex(key, ttl, value);
      } else {
        await redis.set(key, value);
      }
    },
    delete: async (key) => {
      await redis.del(key);
    },
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
    storeSessionInDatabase: true,
  },
  emailVerification: {
    sendOnSignIn: true,
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendSESEmail(
        [user.email],
        'Verify your email',
        ResetPasswordEmail({ userFirstname: user.name, resetPasswordLink: url }),
      );
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendSESEmail(
        [user.email],
        'Reset your password',
        ResetPasswordEmail({ userFirstname: user.name, resetPasswordLink: url }),
      );
    },
  },
  trustedOrigins:
    env.NODE_ENV === 'development'
      ? ['http://localhost:3000']
      : [`https://${process.env.VERCEL_URL ?? ''}`],
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
});

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;
export type Session = Extract<SessionResult, { user: object; session: object }>;
