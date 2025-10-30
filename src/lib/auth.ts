import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { passkey } from 'better-auth/plugins/passkey';

import * as schema from '@/db/auth-schema';
import ResetPasswordEmail from '@/emails/reset-password';
import { db } from '@/lib/db';
import { sendSESEmail } from '@/lib/send-email';

export const auth = betterAuth({
  appName: 'Expense Tracker',
  plugins: [
    passkey(),
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
  ],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
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
  trustedOrigins: [
    'https://local-dev.hardikja.in',
    'https://local-dev-mac.hardikja.in',
    'http://localhost:3000',
  ],
});

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;
export type Session = Extract<SessionResult, { user: object; session: object }>;
