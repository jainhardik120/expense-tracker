'use client';

import { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { GitHubLogoIcon } from '@radix-ui/react-icons';
import { Fingerprint } from 'lucide-react';
import { useQueryStates, parseAsString } from 'nuqs';
import { toast } from 'sonner';
import { z } from 'zod';

import DynamicForm from '@/components/dynamic-form/dynamic-form';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldSeparator } from '@/components/ui/field';
import { FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { authClient, signIn, signUp } from '@/lib/auth-client';

import type { Route } from 'next';

const loginSchema = z.object({
  email: z.email(),
  password: z.string(),
  remember: z.boolean(),
});

const registerSchema = z.object({
  email: z.email(),
  password: z.string(),
  name: z.string(),
});

const forgotPasswordSchema = z.object({
  email: z.email(),
});

const resetPasswordSchema = z.object({
  password: z.string(),
});

const otpSchema = z.object({
  code: z.string(),
});

const ENTER_THE_CODE = 'Enter the code';

const SignInWithPasskeyButton = () => {
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [searchParams] = useQueryStates({
    redirect: parseAsString.withDefault('/'),
  });
  const router = useRouter();

  const signInUsingPasskey = useCallback(
    async (opts?: { autoFill?: boolean }) => {
      await authClient.signIn.passkey(opts, {
        onSuccess: () => {
          router.push(searchParams.redirect as Route);
        },
        onError: (ctx) => {
          toast.error(ctx.error.message);
        },
      });
    },
    [searchParams.redirect, router],
  );

  useEffect(() => {
    const check = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, sonarjs/different-types-comparison
      if (typeof window === 'undefined' || window.PublicKeyCredential === undefined) {
        return;
      }
      const conditionalMediaAvailable = await PublicKeyCredential.isConditionalMediationAvailable();
      if (conditionalMediaAvailable) {
        setPasskeyAvailable(true);
        void signInUsingPasskey({ autoFill: true });
      }
    };
    void check();
  }, [signInUsingPasskey]);

  return (
    <Button
      disabled={!passkeyAvailable}
      type="button"
      variant="outline"
      onClick={() => {
        void signInUsingPasskey();
      }}
    >
      <Fingerprint />
      Login with Passkey
    </Button>
  );
};

const SignInWithGitHubButton = () => {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        await signIn.social({ provider: 'github' });
      }}
    >
      <GitHubLogoIcon />
      Login with GitHub
    </Button>
  );
};
export const LoginForm = () => {
  const [loading, setLoading] = useState(false);
  const [searchParams] = useQueryStates({
    redirect: parseAsString.withDefault('/'),
  });
  const router = useRouter();

  return (
    <DynamicForm
      // eslint-disable-next-line react/no-unstable-nested-components
      FormFooter={() => {
        return (
          <>
            <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
              Or continue with
            </FieldSeparator>
            <Field>
              <SignInWithPasskeyButton />
              <SignInWithGitHubButton />
              <FieldDescription className="text-center">
                Don&apos;t have an account?{' '}
                <Link
                  className="underline underline-offset-4"
                  href={`/auth/register?redirect=${searchParams.redirect}`}
                >
                  Sign up
                </Link>
              </FieldDescription>
            </Field>
          </>
        );
      }}
      defaultValues={{
        email: '',
        password: '',
        remember: false,
      }}
      fields={[
        {
          name: 'email',
          label: 'Email',
          type: 'custom',
          render: (field) => (
            <Input
              autoComplete="email username webauthn"
              className="w-full"
              placeholder="Email"
              type="email"
              value={field.value.toString()}
              onChange={field.onChange}
            />
          ),
        },
        {
          name: 'password',
          label: (
            <div className="flex items-center">
              <FormLabel>Password</FormLabel>
              <Link
                className="ml-auto text-sm underline-offset-4 hover:underline"
                href={`/auth/forgot-password?redirect=${searchParams.redirect}`}
              >
                Forgot password?
              </Link>
            </div>
          ),
          type: 'custom',
          render: (field) => (
            <Input
              autoComplete="current-password webauthn"
              className="w-full"
              placeholder="Password"
              type="password"
              value={field.value.toString()}
              onChange={field.onChange}
            />
          ),
        },
        {
          name: 'remember',
          label: 'Remember me',
          type: 'checkbox',
        },
      ]}
      schema={loginSchema}
      showSubmitButton
      submitButtonDisabled={loading}
      submitButtonText="Login"
      onSubmit={async (values) => {
        await signIn.email(
          {
            email: values.email,
            password: values.password,
            rememberMe: values.remember,
            callbackURL: searchParams.redirect,
          },
          {
            onRequest: () => {
              setLoading(true);
            },
            onResponse: () => {
              setLoading(false);
            },
            onError: (ctx) => {
              toast.error(ctx.error.message);
            },
            onSuccess: (context) => {
              const data = context.data as Record<string, unknown>;
              if ('twoFactorRedirect' in data && data.twoFactorRedirect === true) {
                router.replace(`/auth/two-factor?redirect=${searchParams.redirect}`);
              }
            },
          },
        );
      }}
    />
  );
};

export const RegisterForm = () => {
  const [loading, setLoading] = useState(false);
  const [searchParams] = useQueryStates({
    redirect: parseAsString.withDefault('/'),
  });
  return (
    <DynamicForm
      defaultValues={{
        email: '',
        password: '',
        name: '',
      }}
      fields={[
        {
          name: 'name',
          label: 'Full name',
          type: 'input',
          placeholder: 'Full name',
        },
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          placeholder: 'Email',
        },
        {
          name: 'password',
          label: 'Password',
          type: 'password',
          placeholder: 'Password',
        },
      ]}
      schema={registerSchema}
      showSubmitButton
      submitButtonDisabled={loading}
      submitButtonText="Register"
      onSubmit={async (values) => {
        await signUp.email(
          {
            email: values.email,
            password: values.password,
            name: values.name,
            callbackURL: searchParams.redirect,
          },
          {
            onRequest: () => {
              setLoading(true);
            },
            onResponse: () => {
              setLoading(false);
            },
            onError: (ctx) => {
              toast.error(ctx.error.message);
            },
          },
        );
      }}
    />
  );
};

export const ForgotPasswordForm = () => {
  const [loading, setLoading] = useState(false);
  const [searchParams] = useQueryStates({
    redirect: parseAsString.withDefault('/'),
  });
  return (
    <DynamicForm
      defaultValues={{
        email: '',
      }}
      fields={[
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          placeholder: 'Email',
        },
      ]}
      schema={forgotPasswordSchema}
      showSubmitButton
      submitButtonDisabled={loading}
      onSubmit={async (values) => {
        await authClient.requestPasswordReset(
          {
            email: values.email,
            redirectTo: `/auth/reset-password?redirect=${searchParams.redirect}`,
          },
          {
            onRequest: () => {
              setLoading(true);
            },
            onResponse: () => {
              setLoading(false);
            },
            onError: (ctx) => {
              toast.error(ctx.error.message);
            },
            onSuccess: () => {
              toast.success('Check your email for password reset link');
            },
          },
        );
      }}
    />
  );
};

export const ResetPasswordForm = () => {
  const [loading, setLoading] = useState(false);
  const [searchParams] = useQueryStates({
    redirect: parseAsString.withDefault('/'),
    token: parseAsString,
    error: parseAsString,
  });
  const router = useRouter();
  if (searchParams.token === null || searchParams.error !== null) {
    return (
      <div>
        <p>Invalid token</p>
      </div>
    );
  }
  return (
    <DynamicForm
      defaultValues={{
        password: '',
      }}
      fields={[
        {
          name: 'password',
          label: 'New password',
          type: 'password',
          placeholder: 'Password',
        },
      ]}
      schema={resetPasswordSchema}
      showSubmitButton
      submitButtonDisabled={loading}
      onSubmit={async (values) => {
        await authClient.resetPassword(
          {
            newPassword: values.password,
            token: searchParams.token ?? '',
          },
          {
            onRequest: () => {
              setLoading(true);
            },
            onResponse: () => {
              setLoading(false);
            },
            onError: (ctx) => {
              toast.error(ctx.error.message);
            },
            onSuccess: () => {
              toast.success('Password reset successfully');
              router.push(searchParams.redirect as Route);
            },
          },
        );
      }}
    />
  );
};

export const TwoFactorForm = () => {
  const [loading, setLoading] = useState(false);
  const [searchParams] = useQueryStates({
    redirect: parseAsString.withDefault('/'),
  });
  const router = useRouter();
  return (
    <DynamicForm
      // eslint-disable-next-line react/no-unstable-nested-components
      FormFooter={() => {
        return (
          <Field>
            <FieldDescription className="text-center">
              <Link
                className="underline underline-offset-4"
                href={`/auth/email-otp?redirect=${searchParams.redirect}`}
              >
                Switch to Email Verification
              </Link>
            </FieldDescription>
          </Field>
        );
      }}
      defaultValues={{
        code: '',
      }}
      fields={[
        {
          name: 'code',
          label: ENTER_THE_CODE,
          type: 'input',
          placeholder: ENTER_THE_CODE,
        },
      ]}
      schema={otpSchema}
      showSubmitButton
      submitButtonDisabled={loading}
      onSubmit={async (values) => {
        await authClient.twoFactor.verifyTotp(
          {
            code: values.code,
          },
          {
            onRequest: () => {
              setLoading(true);
            },
            onResponse: () => {
              setLoading(false);
            },
            onError: (ctx) => {
              toast.error(ctx.error.message);
            },
            onSuccess: () => {
              router.push(searchParams.redirect as Route);
            },
          },
        );
      }}
    />
  );
};

export const EmailOTPForm = () => {
  const [loading, setLoading] = useState(false);
  const [searchParams] = useQueryStates({
    redirect: parseAsString.withDefault('/'),
  });
  const router = useRouter();
  const [emailSent, setEmailSent] = useState(false);
  const requestOtp = async () => {
    setLoading(true);
    await authClient.twoFactor.sendOtp();
    setEmailSent(true);
    setLoading(false);
  };
  return (
    <DynamicForm
      // eslint-disable-next-line react/no-unstable-nested-components
      FormFooter={() => {
        return (
          <>
            {!emailSent && (
              <Field>
                <Button disabled={loading} type="button" variant="outline" onClick={requestOtp}>
                  Send OTP to Email
                </Button>
              </Field>
            )}
          </>
        );
      }}
      defaultValues={{
        code: '',
      }}
      fields={[
        {
          name: 'code',
          label: ENTER_THE_CODE,
          type: 'input',
          placeholder: ENTER_THE_CODE,
        },
      ]}
      schema={otpSchema}
      showSubmitButton
      submitButtonDisabled={loading}
      onSubmit={async (values) => {
        await authClient.twoFactor.verifyOtp(
          {
            code: values.code,
          },
          {
            onRequest: () => {
              setLoading(true);
            },
            onResponse: () => {
              setLoading(false);
            },
            onError: (ctx) => {
              toast.error(ctx.error.message);
            },
            onSuccess: () => {
              router.push(searchParams.redirect as Route);
            },
          },
        );
      }}
    />
  );
};
