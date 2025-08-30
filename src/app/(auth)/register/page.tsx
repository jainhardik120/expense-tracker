'use client';

import { useState } from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUp } from '@/lib/auth-client';

export default function Page() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file !== undefined) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Card className="z-50 max-w-md rounded-md rounded-t-none">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">Sign Up</CardTitle>
        <CardDescription className="text-xs md:text-sm">
          Enter your information to create an account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="first-name">First name</Label>
              <Input
                id="first-name"
                placeholder="Max"
                required
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="last-name">Last name</Label>
              <Input
                id="last-name"
                placeholder="Robinson"
                required
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                }}
              />
            </div>
          </div>
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
            <Label htmlFor="password">Password</Label>
            <Input
              autoComplete="new-password"
              id="password"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Confirm Password</Label>
            <Input
              autoComplete="new-password"
              id="password_confirmation"
              placeholder="Confirm Password"
              type="password"
              value={passwordConfirmation}
              onChange={(e) => {
                setPasswordConfirmation(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="image">Profile Image (optional)</Label>
            <div className="flex items-end gap-4">
              {imagePreview === null ? null : (
                <div className="relative h-16 w-16 overflow-hidden rounded-sm">
                  <Image alt="Profile preview" layout="fill" objectFit="cover" src={imagePreview} />
                </div>
              )}
              <div className="flex w-full items-center gap-2">
                <Input
                  accept="image/*"
                  className="w-full"
                  id="image"
                  type="file"
                  onChange={handleImageChange}
                />
                {imagePreview === null ? null : (
                  <X
                    className="cursor-pointer"
                    onClick={() => {
                      setImage(null);
                      setImagePreview(null);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
          <Button
            className="w-full"
            disabled={loading}
            type="submit"
            onClick={async () => {
              await signUp.email({
                email,
                password,
                name: `${firstName} ${lastName}`,
                image: image === null ? '' : await convertImageToBase64(image),
                callbackURL: '/',
                fetchOptions: {
                  onResponse: () => {
                    setLoading(false);
                  },
                  onRequest: () => {
                    setLoading(true);
                  },
                  onError: (ctx) => {
                    toast.error(ctx.error.message);
                  },
                  onSuccess: () => {
                    router.push('/');
                  },
                },
              });
            }}
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : 'Create an account'}
          </Button>
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex w-full justify-center border-t py-4">
          <p className="text-center text-xs text-neutral-500">
            Secured by <span className="text-orange-400">better-auth.</span>
          </p>
        </div>
      </CardFooter>
    </Card>
  );
}

const convertImageToBase64 = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
