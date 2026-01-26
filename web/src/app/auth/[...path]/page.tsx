import { type ReactNode } from 'react';

import Link from 'next/link';

import { Wallet } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import {
  EmailOTPForm,
  ForgotPasswordForm,
  LoginForm,
  RegisterForm,
  ResetPasswordForm,
  TwoFactorForm,
} from './components';

const AuthComponents: {
  [key: string]: {
    Component: (props: Awaited<PageProps<'/auth/[...path]'>>) => ReactNode;
    title: string;
    description: string;
  };
} = {
  login: {
    Component: LoginForm,
    title: 'Welcome back',
    description: 'Enter your email below to login to your account',
  },
  register: {
    Component: RegisterForm,
    title: 'Register',
    description: 'Create an account with your email below',
  },
  'forgot-password': {
    Component: ForgotPasswordForm,
    title: 'Forgot password',
    description: 'Enter your email below to reset your password',
  },
  'reset-password': {
    Component: ResetPasswordForm,
    title: 'Reset password',
    description: 'Enter your new password below',
  },
  'two-factor': {
    title: 'Two-factor authentication',
    description: 'Enter your two-factor authentication code below',
    Component: TwoFactorForm,
  },
  'email-otp': {
    title: 'Two-factor authentication',
    description: 'Verify your identity with a one-time password',
    Component: EmailOTPForm,
  },
};

export default async function Page(props: Readonly<PageProps<'/auth/[...path]'>>) {
  const { path } = await props.params;
  if (path.length === 0) {
    return null;
  }
  const AuthComponent = AuthComponents[path[0]];
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link className="flex items-center gap-2 self-center font-medium" href="/">
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <Wallet className="size-4" />
          </div>
          Expense Tracker
        </Link>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-xl">{AuthComponent.title}</CardTitle>
              <CardDescription>{AuthComponent.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <AuthComponent.Component {...props} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
