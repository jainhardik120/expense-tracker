'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn } from '@/lib/auth-client';

export default function Page() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">Sign In</CardTitle>
        <CardDescription className="text-xs md:text-sm">
          Enter your email below to login to your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              placeholder="m@example.com"
              required
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center">
              <Label htmlFor="password">Password</Label>
              <Link className="ml-auto inline-block text-sm underline" href="#">
                Forgot your password?
              </Link>
            </div>

            <Input
              autoComplete="password"
              id="password"
              placeholder="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="remember"
              onClick={() => {
                setRememberMe(!rememberMe);
              }}
            />
            <Label htmlFor="remember">Remember me</Label>
          </div>

          <Button
            className="w-full"
            disabled={loading}
            type="submit"
            onClick={async () => {
              await signIn.email(
                {
                  email,
                  password,
                  rememberMe,
                  callbackURL: '/',
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
                    router.push('/');
                  },
                },
              );
            }}
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <p> Login </p>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
