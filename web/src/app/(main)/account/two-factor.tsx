'use client';

import { useState } from 'react';

import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import QRCode from 'react-qr-code';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type Session } from '@/lib/auth';
import { authClient } from '@/lib/auth-client';

const ENABLE_2FA = 'Enable 2FA';
const DISABLE_2FA = 'Disable 2FA';

const TwoFactor = ({ session }: { session: Session | null }) => {
  const [isPendingTwoFa, setIsPendingTwoFa] = useState<boolean>(false);
  const [twoFaPassword, setTwoFaPassword] = useState<string>('');
  const [twoFactorDialog, setTwoFactorDialog] = useState<boolean>(false);
  const [twoFactorVerifyURI, setTwoFactorVerifyURI] = useState<string>('');
  const twoFactorEnabled: boolean = session?.user.twoFactorEnabled === true;
  const dialogButtonText = twoFactorEnabled === true ? DISABLE_2FA : ENABLE_2FA;
  return (
    <Dialog open={twoFactorDialog} onOpenChange={setTwoFactorDialog}>
      <DialogTrigger asChild>
        <Button className="gap-2" variant={twoFactorEnabled === true ? 'destructive' : 'outline'}>
          {twoFactorEnabled ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
          <span className="text-xs md:text-sm">{dialogButtonText}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-11/12 sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{dialogButtonText}</DialogTitle>
          <DialogDescription>
            {twoFactorEnabled
              ? 'Disable the second factor authentication from your account'
              : 'Enable 2FA to secure your account'}
          </DialogDescription>
        </DialogHeader>

        {twoFactorVerifyURI.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center">
              <QRCode value={twoFactorVerifyURI} />
            </div>
            <Label htmlFor="password">Scan the QR code with your TOTP app</Label>
            <Input
              placeholder="Enter OTP"
              value={twoFaPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setTwoFaPassword(e.target.value);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              placeholder="Password"
              type="password"
              value={twoFaPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setTwoFaPassword(e.target.value);
              }}
            />
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={isPendingTwoFa}
            onClick={async () => {
              setIsPendingTwoFa(true);
              if (twoFactorEnabled) {
                await authClient.twoFactor.disable({
                  password: twoFaPassword,
                  fetchOptions: {
                    onError: (context) => {
                      toast.error(context.error.message);
                    },
                    onSuccess: () => {
                      toast('2FA disabled successfully');
                      setTwoFactorDialog(false);
                    },
                  },
                });
              } else {
                if (twoFactorVerifyURI.length > 0) {
                  await authClient.twoFactor.verifyTotp({
                    code: twoFaPassword,
                    fetchOptions: {
                      onError: (context) => {
                        setIsPendingTwoFa(false);
                        setTwoFaPassword('');
                        toast.error(context.error.message);
                      },
                      onSuccess: () => {
                        toast('2FA enabled successfully');
                        setTwoFactorVerifyURI('');
                        setIsPendingTwoFa(false);
                        setTwoFaPassword('');
                        setTwoFactorDialog(false);
                      },
                    },
                  });
                  return;
                }
                await authClient.twoFactor.enable({
                  password: twoFaPassword,
                  fetchOptions: {
                    onError: (context) => {
                      toast.error(context.error.message);
                    },
                    onSuccess: (ctx: { data: { totpURI: string } }) => {
                      setTwoFactorVerifyURI(ctx.data.totpURI);
                    },
                  },
                });
              }
              setIsPendingTwoFa(false);
              setTwoFaPassword('');
            }}
          >
            {isPendingTwoFa ? <Loader2 className="animate-spin" size={15} /> : dialogButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TwoFactor;
