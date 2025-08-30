'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { api } from '@/server/react';
import { createAccountSchema } from '@/types';

import type { z } from 'zod';

const CreateAccountForm = ({ refresh }: { refresh?: () => void }) => {
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof createAccountSchema>>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      startingBalance: '0',
      accountName: '',
    },
  });
  const mutation = api.accounts.createAccount.useMutation();
  const onSubmit = (values: z.infer<typeof createAccountSchema>) => {
    mutation
      .mutateAsync(values)
      .then(() => {
        toast('Account created successfully');
        setOpen(false);
        return refresh?.();
      })
      .catch((err) => {
        setOpen(false);
        toast.error(err instanceof Error ? err.message : String(err));
      });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Create Account</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Account</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="accountName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="startingBalance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Starting Balance</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">Submit</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAccountForm;
